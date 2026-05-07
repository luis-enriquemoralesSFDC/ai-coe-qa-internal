import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_usage_service
from ..models import User
from ..schemas import UserCreate, UserLogin, UserOut, Token, UsageSummary
from ..services.usage_service import UsageService
from .utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        logger.warning("Intento de registro con email ya existente: %s", data.email)
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Nuevo usuario registrado: id=%s email=%s", user.id, user.email)
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/login", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        logger.warning("Login fallido para email: %s", data.email)
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    logger.info("Login exitoso: id=%s email=%s", user.id, user.email)
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/usage", response_model=UsageSummary)
def me_usage(
    current_user: User = Depends(get_current_user),
    usage_svc: UsageService = Depends(get_usage_service),
):
    """Resumen de uso/cuota del mes en curso para el usuario actual."""
    return usage_svc.get_summary(current_user)
