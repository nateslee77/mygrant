from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import admin, auth, dashboard, grants, notifications, photo_template

app = FastAPI(title="LA County Parks Grants Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(grants.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(photo_template.router)


@app.get("/health")
def health():
    return {"status": "ok"}
