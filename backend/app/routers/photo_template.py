import re
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status

from app.core.deps import get_current_user
from app.models.models import User
from app.services.photo_template import generate_photo_template, validate_image

router = APIRouter(prefix="/photo-template", tags=["photo-template"])

VALID_STATUSES = {"completed", "in_progress"}
MAX_PHOTO_BYTES = 15 * 1024 * 1024  # 15MB per photo


def _safe_filename_part(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return slug or "project"


@router.post("")
async def create_photo_template(
    project_name: str = Form(...),
    status_: str = Form(..., alias="status"),
    labels: list[str] = Form(default=[]),
    photos: list[UploadFile] = File(...),
    _user: User = Depends(get_current_user),
):
    if status_ not in VALID_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status must be 'completed' or 'in_progress'")
    if not project_name.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Project name is required")
    if not (2 <= len(photos) <= 6):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Must upload between 2 and 6 photos")

    photo_data = []
    for i, upload in enumerate(photos):
        content = await upload.read()
        if len(content) > MAX_PHOTO_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Photo {i + 1} exceeds 15MB")
        try:
            validate_image(content)
        except Exception:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Photo {i + 1} isn't a valid image") from None
        label = labels[i].strip() if i < len(labels) else ""
        photo_data.append((content, label))

    docx_bytes = generate_photo_template(project_name.strip(), status_, photo_data)

    filename = f"{_safe_filename_part(project_name)}_photos_{date.today().isoformat()}.docx"

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
