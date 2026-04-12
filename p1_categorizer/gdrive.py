"""
gdrive.py — Google Drive 연동
OAuth2 인증 후 지정 폴더에 JSON 파일 업로드
"""

import os
import json
import io
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_FILE = "token.json"
CREDS_FILE = "credentials.json"
FOLDER_NAME = "ExamCategorizer"


def get_service():
    """OAuth2 인증 후 Drive 서비스 반환."""
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDS_FILE):
                raise FileNotFoundError(
                    "credentials.json 파일이 없습니다. "
                    "Google Cloud Console에서 OAuth 클라이언트 ID를 다운로드하세요."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    return build("drive", "v3", credentials=creds)


def get_or_create_folder(service, folder_name: str) -> str:
    """폴더 ID 반환 (없으면 생성)."""
    query = (
        f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' "
        f"and trashed=false"
    )
    results = service.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])

    if files:
        return files[0]["id"]

    folder = service.files().create(
        body={"name": folder_name, "mimeType": "application/vnd.google-apps.folder"},
        fields="id",
    ).execute()
    return folder["id"]


def upload_json(data: dict, filename: str) -> str:
    """JSON 데이터를 Drive에 업로드하고 파일 ID 반환."""
    service = get_service()
    folder_id = get_or_create_folder(service, FOLDER_NAME)

    content = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype="application/json")

    file_meta = {"name": filename, "parents": [folder_id]}
    result = service.files().create(
        body=file_meta, media_body=media, fields="id,webViewLink"
    ).execute()

    return result.get("webViewLink", "")
