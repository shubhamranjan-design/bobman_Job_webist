"""Candidate anonymization helpers.

Goals:
- Never expose candidate name, phone, email, LinkedIn URL, CV file URL.
- Replace any incidental occurrences of the real name in LLM-generated text with
  a neutral placeholder before serving to the frontend.
"""
import re
from typing import Optional


def mask_id(candidate_uuid: str, role_code: Optional[str] = None) -> str:
    """Stable masked ID derived from the first 6 chars of the UUID, uppercased.

    If role_code is provided, the ID encodes the role context so the same
    candidate matched to multiple roles produces multiple distinct masked IDs:
        C-E51C4C            (no role context)
        C-E51C4C-US06       (matched against US06)
    """
    if not candidate_uuid:
        return "C-UNKNOWN"
    short = candidate_uuid.replace("-", "")[:6].upper()
    base = f"C-{short}"
    if role_code:
        return f"{base}-{role_code.upper()}"
    return base


def parse_masked_id(masked_id: str) -> tuple[str, Optional[str]]:
    """Reverse of mask_id. Returns (short_uuid, role_code or None).
    Example: 'C-E51C4C-US06' -> ('E51C4C', 'US06')
             'C-E51C4C'       -> ('E51C4C', None)
    """
    if not masked_id:
        return ("", None)
    s = masked_id.strip().upper()
    if not s.startswith("C-"):
        return ("", None)
    rest = s[2:]
    parts = rest.split("-", 1)
    short = parts[0]
    role = parts[1] if len(parts) > 1 else None
    return (short, role)


def unmask_id_lookup(masked_id: str, candidates: list[dict], id_field: str = "id") -> Optional[str]:
    """Given a list of candidate dicts, find the full UUID matching this masked id.
    Role suffix is ignored — we only look up by the candidate short-uuid prefix.
    """
    if not masked_id:
        return None
    short, _ = parse_masked_id(masked_id)
    if not short:
        return None
    for c in candidates:
        uuid = c.get(id_field, "") or ""
        if uuid.replace("-", "")[:6].upper() == short:
            return uuid
    return None


# Words that on their own are not really "names" — guard against false positives.
_COMMON_WORDS = {
    "the", "and", "this", "that", "they", "their", "for", "with",
    "from", "have", "has", "had", "but", "into", "than", "more",
}


def scrub_pii(text: Optional[str], full_name: Optional[str]) -> Optional[str]:
    """Replace occurrences of the candidate's name(s) in `text` with a neutral phrase.

    Replaces:
      - the full name (case-insensitive) → "this candidate"
      - any individual name token longer than 2 chars (e.g. first name) → "this candidate"
        when it's a standalone whole word.
    """
    if not text or not full_name:
        return text
    out = text
    full_name = full_name.strip()
    if not full_name:
        return out

    # 1) full-name replacement first (longest match)
    pattern = re.compile(re.escape(full_name), re.IGNORECASE)
    out = pattern.sub("this candidate", out)

    # 2) token-by-token replacement for first / last names
    tokens = [t for t in re.split(r"\s+", full_name) if t and len(t) > 2 and t.lower() not in _COMMON_WORDS]
    for tok in tokens:
        # whole-word, case-insensitive
        word_pat = re.compile(rf"\b{re.escape(tok)}\b", re.IGNORECASE)
        out = word_pat.sub("this candidate", out)

    # Collapse repeated "this candidate this candidate"
    out = re.sub(r"(this candidate)(\s+this candidate)+", r"\1", out, flags=re.IGNORECASE)
    return out


_ROLE_CODE_RE = re.compile(r"\bUS\d{2}\b")


def scrub_role_codes(text: Optional[str], role_name: Optional[str]) -> Optional[str]:
    """Replace any 'US01'..'US99' role-code mentions with the human role name (or 'this role')."""
    if not text:
        return text
    replacement = role_name or "this role"
    return _ROLE_CODE_RE.sub(replacement, text)


def mask_name(full_name: Optional[str]) -> str:
    """Anonymize the candidate's name for display.
    Each whitespace-separated token becomes: first letter + ** + last letter (uppercase).
    Examples:
        'Runam Pathak'     -> 'R**M P**K'
        'A'                -> 'A'
        'Bob'              -> 'B**B'
    """
    if not full_name or not full_name.strip():
        return "C****"
    out = []
    for tok in re.split(r"\s+", full_name.strip()):
        if len(tok) <= 1:
            out.append(tok.upper())
        elif len(tok) == 2:
            out.append((tok[0] + "*").upper())
        else:
            out.append((tok[0] + "**" + tok[-1]).upper())
    return " ".join(out)


def name_initials(full_name: Optional[str]) -> str:
    """First letter of each token, uppercased. 'Runam Pathak' -> 'RP'."""
    if not full_name or not full_name.strip():
        return "??"
    parts = [t for t in re.split(r"\s+", full_name.strip()) if t]
    if not parts:
        return "??"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def scrub_pii_list(items: Optional[list], full_name: Optional[str]) -> list:
    """Apply scrub_pii to every string in a list. Leaves non-strings as-is."""
    if not items:
        return []
    out = []
    for x in items:
        if isinstance(x, str):
            out.append(scrub_pii(x, full_name))
        else:
            out.append(x)
    return out
