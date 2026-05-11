"""SQLAlchemy models for SaaS-specific tables (companies, unlocks, role_views, candidate_pitches)."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from database import Base


class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    credits_remaining = Column(Integer, nullable=False, default=10)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Unlock(Base):
    __tablename__ = "unlocks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    candidate_user_id = Column(String, nullable=False, index=True)  # Supabase UUID
    field = Column(String, nullable=False)  # 'phone' | 'email'
    unlocked_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (
        UniqueConstraint("company_id", "candidate_user_id", "field", name="uq_unlock"),
        CheckConstraint("field IN ('phone','email')", name="ck_unlock_field"),
    )


class RoleView(Base):
    __tablename__ = "role_views"
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    role_code = Column(String, nullable=False, index=True)
    viewed_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CandidatePitch(Base):
    __tablename__ = "candidate_pitches"
    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_user_id = Column(String, nullable=False, index=True)
    role_code = Column(String, nullable=False, index=True)
    pitch_text = Column(Text, nullable=False)
    source_match_jd_id = Column(String, nullable=True)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (
        UniqueConstraint("candidate_user_id", "role_code", name="uq_pitch"),
    )
