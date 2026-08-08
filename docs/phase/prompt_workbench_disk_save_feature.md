# 📑 던전 수사 조서: 에셋 워크벤치 PM 전용 '1클릭 프로젝트 assets/ 직저장' 기능 구현 설계 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 코딩 에이전트에 전달하여, 에셋 워크벤치에서 PM/기획자가 버튼 하나만 누르면 업로드된 PNG 파일과 `asset_manifest.json`이 로컬 프로젝트 폴더(`dungeon-dossier/assets/`)로 바로 파일 저장되는 백엔드 API 및 UI 미들웨어에 대한 **구현 설계서(`docs/design/workbench_disk_save_feature_design.md`)**를 저작하고 코드를 자동 구현하도록 지시합니다.

```markdown
Role: Senior Full-Stack Engineer & Vite Developer Tooling Specialist
Task: Generate Comprehensive Architecture Design Specifications and Implement a PM-Friendly 1-Click Asset Direct Disk Saving Middleware (`/api/workbench/save`) for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 기능 개요 및 개발 목표 (Objective)

현재 에셋 워크벤치는 브라우저 `localStorage` 및 개별 다운로드만 지원하여 기획자(PM)가 작업을 마친 뒤 수동으로 `assets/` 폴더에 다운로드 파일을 옮겨야 하는 번거로움이 있습니다.
Vite 개발 서버 미들웨어(`saveWorkbenchAssetsPlugin`)와 워크벤치 UI 상의 **`[ 💾 프로젝트 assets/ 에 직접 저장 ]`** 버튼을 신설하여, 드래그 앤 드롭 후 **버튼 1번 클릭으로 로컬 코드베이스 `dungeon-dossier/assets/` 폴더로 실시간 직접 파일 기록**이 가능하도록 구축하세요.

---

## 2. ⚙️ 핵심 아키텍처 명세 (Core Architecture Specifications)

### 1️⃣ Vite 개발 서버 직저장 미들웨어 플러그인 (`vite.config.ts`)
- **API 엔드포인트**: `POST /api/workbench/save`
- **서버 핸들러 로직 (`saveWorkbenchAssetsPlugin`)**:
  1. 클라이언트에서 전달된 JSON 바디 파싱: `{ manifest: AssetManifest, files: Record<string, string> }`
  2. `dungeon-dossier/assets/` 디렉터리 존재 여부 확인 및 자동 생성 (`fs/promises.mkdir`).
  3. `asset_manifest.json` 파일을 `assets/` 루트에 포맷팅하여 직저장 (`JSON.stringify(manifest, null, 2)`).
  4. Base64 Data URL (`data:image/png;base64,...`) 파일들을 Node.js `Buffer`로 변환하여 `assets/` 폴더 내 개별 PNG 파일로 덮어쓰기 기록.
  5. 처리 완료 후 성공 응답 반환: `{ ok: true, savedFiles: string[], message: string }`.

### 2️⃣ 워크벤치 UI & 버튼 핸들러 연동 (`workbench/index.html`, `workbench/main.mts`, `workbench/style.css`)
- **버튼 UI 추가 (`workbench/index.html`)**:
  - 툴바 및 인스펙터 패널 상단에 황금색 하이라이트 형태의 **`[ 💾 프로젝트 assets/ 에 직접 저장 ]`** 전용 버튼 추가.
- **클라이언트 전송 로직 (`workbench/main.mts`)**:
  - 현재 워크벤치에 업로드/등록된 모든 슬롯의 Base64 PNG 이미지 딕셔너리(`collectWorkbenchImagesBase64`) 수집.
  - 현재 16개 슬롯의 `AssetManifest` 문서 생성.
  - `fetch('/api/workbench/save')` 호출 및 처리 경과를 하단 상태창(`save-status`)에 명확한 한국어 알림으로 출력:
    - *성공 시*: `"✅ PM 알림: 14개 에셋이 dungeon-dossier/assets/ 폴더에 직접 저장되었습니다."`
    - *실패 시*: `"❌ 저장 실패: [에러 원인]"`

---

## 3. 📑 구현 설계서 저작 프로토콜 (Design Document Protocol)

AI 코딩 에이전트는 코드 수정 전, 다음 항목을 포함하는 **상세 구현 설계서 (`docs/design/workbench_disk_save_feature_design.md`)**를 가장 먼저 작성하세요:

1. **Section 1: Architectural Flowchart**: 워크벤치 UI ➡️ HTTP POST ➡️ Vite Middleware ➡️ Node.js FS `assets/` 파일 기록 흐름도
2. **Section 2: Payload Schema & API Contract**: `/api/workbench/save` 요청/응답 JSON 스키마 및 예외 처리 규격
3. **Section 3: UI Layout & Status Feedback**: 1클릭 저장 버튼 위치, CSS 디자인 및 진행 상태 텍스트 연출
4. **Section 4: Verification & Integration Tests**: Node.js fs 백엔드 미들웨어 통합 테스트 수순

---

## 4. 🧪 검증 게이트 (Quality Verification)

구현 완료 후 다음 자동화 검증 명령을 100% GREEN으로 통과해야 합니다:
```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm build
```

Acknowledge these specifications and reply: "PM 1-Click Asset Disk Save Feature Architecture Initialized."
```
