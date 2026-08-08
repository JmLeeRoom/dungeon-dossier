# 📑 던전 수사 조서: Claude Opus 전용 PDF 게임 소개·플레이 및 실행 매뉴얼 문서 작성 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 **Claude 3.5/3.7 Opus** 모델에 전달하여 **[던전 수사 조서 (Dungeon Detective Kim Taehoon)]**의 게임 개요, 시스템 메커니즘, 플레이 방법, UI 조작법, 개발 서버 실행법 및 에셋 워크벤치 사용법이 집약된 **최종 제출용 PDF 인쇄 규격 마크다운 문서(`docs/manual/dungeon_detective_game_manual.md`)**를 자동 저작하도록 지시합니다.

```markdown
Role: Principal Game Designer, Technical Writer & Presentation Publishing Lead
Task: Generate a Publication-Ready Game Manual and Execution Specification Document in PDF Printable Markdown for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 목표 및 제출 규격 (Document Requirements)

본 문서의 목적은 기획서 평가위원회 및 플레이어에게 **[던전 수사 조서]** 게임의 독창적 세계관, 5계층 아키텍처, 추리 심문 시스템, 5레이어 카드 조작법, 실행 방법 및 에셋 워크벤치 튜닝법을 완벽히 설명하는 **최종 제출용 PDF 인쇄용 종합 매뉴얼(`docs/manual/dungeon_detective_game_manual.md`)**을 저작하는 것입니다.

### 📐 PDF 인쇄 스타일 가이드 (CSS & Layout Rules)
- A4 규격 레이아웃 및 깔끔한 CSS 스타일링 (Print Style / Page Break Directives 포함).
- 풍부한 픽셀 아트 컬러 팔레트 (Dark Ink `#0f0d0a`, Gold `#d4af37`, Cyan `#00b4d8`, Parchment `#f4e8c1`).
- 표(Table), 인용문(Blockquote), 키보드 단축키 UI 뱃지(`<kbd>`), 코드 블록 및 흐름도를 명확히 배치.

---

## 2. 📑 본문 구성 및 필수 수록 내용 (Required Content Structure)

### 📌 SECTION 1. 게임 개요 (Game Overview)
1. **타이틀 & 장르**: [던전 수사 조서] - 픽셀 그래픽 던전 추리 심문 시뮬레이션 (Pixel-Art Deduction Interrogation RPG).
2. **세계관 & 시놉시스**: 마왕군 몬스터들이 범죄를 저지르는 던전 취조실에서 베테랑 형사 '김태훈'과 파트너 '김인턴'이 증거물과 진술 간의 모순을 밝혀 자백을 받아내는 추리극.
3. **핵심 게임성 (Core Features)**:
   - **TruthGraph & 모순 검증 엔진**: 진술 태그(`누가`, `언제`, `어디서` 등)와 증거물 간의 논리 모순을 파악하여 심문.
   - **평정심 vs 강압 수사 수치**: 용의자의 평정심(Composure)을 0으로 만들어 패배/자백을 유도하되, 잘못된 수 제출 시 강압 수사(Coercion) 수치 상승.
   - **5계층 조건부 카드 시스템**: Base 템플릿, 일러스트, 인장, 특수 효과, 증거물 결합 오버레이의 Z-Index 레이어드 렌더링.

### 📌 SECTION 2. 플레이 방법 및 UI 조작 가이드 (Gameplay & UI Guide)
1. **화면 구성 (1280×800 HD 뷰포트)**:
   - 상단: 취조실 배경 및 용의자 초상화 (Base, Upset, Lose 3상태 512×512 파츠) + 파트너 쿨다운 뱃지.
   - 중단: 책상 전경 (1280×321 px) + 평정심/강압도 멘탈 게이지.
   - 하단: 카드 패널 (기본 20% 노출 → 호버 시 40% 상승 & 하이라이트 → 클릭 시 640×725 전체화면 모달).
2. **심문 진행 순서 (Turn Flow)**:
   - 진술 수집 ➡️ 카드를 드래그하여 태그 칩에 점선 연결(Dotted Line Link) ➡️ 증거물 결합 ➡️ 제출(Submit) ➡️ 용의자 반응 및 평정심 감소/모순 텍스트 피드백.
3. **파트너 스킬 & 쿨다운 시스템**:
   - `base` (스킬 사용 가능) ↔ `used` (쿨다운 진행, 중앙 남아있는 턴 수 표시 후 0턴 도달 시 재활성화).

### 📌 SECTION 3. 실행 방법 & 접속 모드 (Execution & Environment Guide)
1. **개발 서버 실행법**:
   ```bash
   cd dungeon-dossier
   cmd /c "npm run dev"
   ```
2. **주요 접속 모드 URL**:
   - 🎮 **메인 게임 화면**: `http://localhost:5174/`
   - 🎬 **2분 30초 무인 시네마틱 완주**: `http://localhost:5174/?autoplay=true&mode=video`
   - 🛠️ **라이브 에셋 워크벤치**: `http://localhost:5174/workbench/`
3. **Vite 504 오류 대처법**: `Ctrl + F5` 강제 새로고침 또는 `npx vite --force`.

### 📌 SECTION 4. 기획자용 에셋 워크벤치 매뉴얼 (Asset Workbench Manual)
1. **드래그 앤 드롭 PNG 업로드**: 원하는 PNG 이미지를 슬롯 위로 드롭하여 실시간 적용.
2. **기즈모 조작 (Tweak Mode)**: 이동(`x, y`), 회전(`rotation`), 크기(`customWidth, customHeight, scaleX, scaleY`), 비율 고정(`preserveAspectRatio`).
3. **PM 1클릭 파일 직저장 버튼**: `[ 💾 프로젝트 assets/ 에 직접 저장 ]` 버튼을 누르면 Node.js 개발 서버를 통해 `dungeon-dossier/assets/` 폴더 및 `asset_manifest.json`으로 1초 만에 직접 저장.

---

## 3. 🧪 저작 실행 프로토콜 (Execution Protocol)

Opus 모델은 위 구조를 바탕으로 `docs/manual/dungeon_detective_game_manual.md` 문서를 작성하고, HTML/CSS 인쇄 스타일을 포함하여 브라우저에서 바로 PDF로 출력이 가능하도록 완성하세요.

Acknowledge these manual writing specifications and reply: "Opus PDF Game Manual Generation Protocol Activated."
```
