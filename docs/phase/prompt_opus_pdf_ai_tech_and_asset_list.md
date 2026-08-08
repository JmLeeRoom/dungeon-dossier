# 📑 던전 수사 조서: Claude Opus 전용 PDF AI 활용 기술 문서 & 에셋 리스트업 작성 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 **Claude 3.5/3.7 Opus** 모델에 전달하여, **AI 도구 활용 내역(MCP, Hook, Skill, Subagent 사용 기술)**과 **전수 에셋 리스트업 및 AI 이미지 생성 프롬프트 명세서**가 집약된 **최종 제출용 PDF 인쇄 규격 마크다운 문서(`docs/manual/ai_tech_and_asset_specifications.md`)**를 자동 저작하도록 지시합니다.

```markdown
Role: Lead AI Technical Director & Game Asset Production Manager
Task: Generate a Publication-Ready AI Technology Architecture & Asset Generation Prompt Specification Document in PDF Printable Markdown for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 목표 및 제출 규격 (Document Objectives)

본 문서의 목적은 심사위원 및 평가위원회에 **[던전 수사 조서]** 개발에 활용된 **AI 파이프라인 기술(MCP, Hook, Skill, Subagent 분업 구조)**과 인게임에 사용된 **모든 픽셀 아트 에셋의 분류, 설명, 생성 프롬프트(Midjourney/FLUX --ar 규격 포함) 전수 리스트업**을 명확히 증명하는 **최종 제출용 PDF 인쇄 마크다운 문서(`docs/manual/ai_tech_and_asset_specifications.md`)**를 저작하는 것입니다.

---

## 2. 📑 본문 구성 명세 (Required Content Sections)

### 📌 SECTION 1. AI 활용 기술 & 파이프라인 내역 (AI Technology Stack)

1. **활용 AI 모델 & 개발 엔진**:
   - **Main LLMs**: Claude 3.5/3.7 Opus (시스템 설계 및 종합 매뉴얼저작), Antigravity Agent Engine (코드 베이스 리팩토링 및 게이트 자동화), OpenAI GPT-4o.
   - **AI Image Generation**: Midjourney v6 / FLUX.1 (픽셀 아트, PC-9800 팔레트, 하드보일드 에셋 생성).
2. **MCP (Model Context Protocol) 파이프라인**:
   - 프레임워크 스키마 탐색, 코드 구조 감사, 테스트 로그 트레이싱 및 커스텀 미들웨어 서버 툴링 연동.
3. **Hook 시스템 (Safety & Gate Enforcement)**:
   - **Pre-commit & Build Safety Hooks**: `typecheck`, `test:gates`, `content:validate`, `palette:check`.
   - **Stop Hooks**: 전수 검증 및 회귀 테스트 100% 통과(PASS) 증거 확보 전 무단 종료를 차단하는 에이전트 안전망.
4. **Skill 커스텀 지식 체계 (`.agents/skills/`)**:
   - 5계층 아키텍처 준수 스킬, Zod 스키마 검증 스킬, PixiJS 1280×800 HD 뷰포트 스케일링 스킬, 15노드 무인 자동 플레이 검증 스킬 구축 및 활용.
5. **Subagent 분업 자율 아키텍처**:
   - **Browser Subagent**: 1280×800 실제 뷰포트 렌더링, 카드 20%→40% 호버 슬라이드, `?autoplay=true&mode=video` 시네마틱 완주 자동 검증 및 스크린샷 획득.
   - **Task Management Subagent**: Vite 개발 서버(`npm run dev`) 백그라운드 관리 및 Vitest 전수 테스트 수트 동시 비동기 집행.

---

### 📌 SECTION 2. 전수 에셋 리스트업 및 AI 생성 프롬프트 (Asset Inventory & Prompts)

다음 5개 카테고리의 모든 에셋에 대해 **[분류 | 에셋명 | 설명 및 특징 | 생성 프롬프트 (AI Image Generation)]** 표를 완벽하게 작성하세요:

#### 1️⃣ 배경 (Backgrounds)
- **취조실 (메인 화면)**: 640×400/1280×800, 탁상 램프 단일 광원, 시안 16색 팔레트, Inscryption 구도 (`--ar 16:10`)
- **취조실 배경 (1280x800)**: 낡은 철제 책상 중앙 비좁은 취조실 (`--ar 16:9`)
- **수사 보드 (크레이지 보드)**: 붉은 실과 단서 핀이 연결된 코르크 보드 (`--ar 16:9`)
- **비밀 금고 내부**: 텅 빈 금고, 붉은 장부, 결재 도장, 포스트잇 (`--ar 16:10`)
- **디지털 포렌식**: 밴시 스마트폰 1인칭 화면 (`--ar 16:10`)
- **휴게실 (P1)**: 자판기, 소파, 던전 야경 (`--ar 16:10`)

#### 2️⃣ UI & 상태 에셋 (UI Elements & Status Assets)
- **코어 스테이터스 바**: 스트레스, 강압 수사, 평정심, CP 게이지 (`--ar 16:9`)
- **낡은 서류철**: 인벤토리 창 누런 서류 보관 철 (`--ar 16:9`)
- **수사 카드 베이스**: 3분할 640×725 템플릿, 클립 오버레이 (`--ar 3:4`)
- **육하원칙 텍스트 태그**: 진술 라벨 태그 (`--ar 2:1`)
- **방어막 이펙트**: 텍스트 태그 덧씌움 에너지 쉴드 (`--ar 2:1`)
- **블라인드 셔플**: 맥주 거품 오버레이 (`--ar 2:1`)
- **실시간 후원 QTE 팝업**: 밴시 스트리머 난입 팝업 (`--ar 16:9`)
- **사건 파일 선택**: 3지 선다 미제 서류 폴더 (`--ar 16:9`)
- **긴급 수사 파일**: 붉은색 확정 연계 사건 폴더 (`--ar 1:1`)
- **평정심 게이지**: 고전 보스바, 30% 스위트 스팟 눈금 마커 (`--ar 14:1`)
- **강압 결재판**: 결재판 베이스 + 빨간 경고장 소형 아이콘 (`--ar 16:9`)
- **진술창 (텍스트 박스)**: PC-98 어드벤처 텍스트 박스 (`--ar 16:3`)
- **태그 칩 스프라이트 시트**: 9-slice 4상태(기본, 방어막, 파훼, 흔들림) + 6종 육하원칙 아이콘 (`--ar 16:9`)
- **압정 세트 / 물음표 메모지 / 클리어 도장 / 위치 마커** (`--ar 1:1` ~ `2:1`)
- **이벤트 창 프레임 / 선택지 버튼 (3상태) / 선택 아이콘 (휴식, 단련)**
- **상태 수치 아이콘 (평정심 - 푸른 뇌/방패, 강압도 - 붉은 철권/경찰봉)** (`--ar 1:1`)
- **공통 버튼 아이콘 (Retry, Back, Settings, Skip)** (`--ar 1:1`)
- **포스트잇 컨셉 버튼 4종 (Retry, Back, Settings, Skip)** (`--ar 1:1`)
- **설정 화면 모크업 4종 (Display, Audio, Controls, Accessibility)** (`--ar 16:10`)

#### 3️⃣ 단서 및 증거 (Evidences & Clues - Polaroid Format)
- **물건 (마석)**: 붉은 마석 클로즈업 폴라로이드 (`--ar 1:1`)
- **인물 (목격자)**: 덜덜 떠는 하피 폴라로이드 (`--ar 1:1`)
- **문서 (장부)**: 피 묻은 장부 폴라로이드 (`--ar 1:1`)
- **[원본 설계도면]**: 차원 엘리베이터 청사진 폴라로이드 (`--ar 1:1`)
- **[비자금 장부]**: 붉은 가급 장부 폴라로이드 (`--ar 1:1`)
- **[찢어진 황금 엘릭서 껍질]**: 찢어진 믹스커피 스틱 폴라로이드 (`--ar 1:1`)

#### 4️⃣ 캐릭터 (Character References & Sprites)
- **김태훈 (메인 형사)** & **김인턴 (슬라임 종이컵)** (`--ar 1:1`)
- **미노타우로스 (보스)**, **밴시 스트리머**, **드워프 감리사**, **파이어 샐러맨더** (`--ar 9:16`)
- **물컹이 (청소부)**, **오크 경리**, **가고일 안내원**, **스켈레톤 야근자**, **골렘 현장소장**, **미믹 택시기사**, **구울 브로커**, **듀라한 경비원**, **사이클롭스 기사**, **고블린 하청업자** (`--ar 9:16`)
- **서큐버스 본부장**, **뱀파이어 시술의**, **마왕건설 대표 (타락한 용사)** (`--ar 9:16`)
- **켄타우로스 인사팀장**: 넥타이 차림의 화이트칼라 켄타우로스 스탠딩 (`--ar 4:3`)

#### 5️⃣ 카드 일러스트 & 강화 파츠 (Card Illustrations & Modifiers)
- **유도 신문 (1CP)**, **서류철 툭 던지기 (1CP)**, **모순 지적 (2CP)**, **결정적 물증 (2CP)**, **알루미늄 배트 위협 (2CP)** (`--ar 1:1`)
- **[특수] 고블린의 목격담 (1CP)**, **[특수] 압수수색 영장 (3CP)**, **[악성 채팅] 일러스트** (`--ar 1:1`)
- **결재 도장 (파란/빨간)**, **형광 포스트잇**, **철제 불독 클립**, **카드 봉인 (키스 마크)** (`--ar 1:1` ~ `2:1`)

---

## 3. 🧪 저작 프로토콜 (Execution Protocol)

Opus 모델은 위 모든 내용을 종합하여 `docs/manual/ai_tech_and_asset_specifications.md` 문서로 저작하고, HTML/CSS PDF 인쇄 스타일을 포함하여 완벽한 보고서 형태로 작성하세요.

Acknowledge these specification requirements and reply: "Opus AI Technology and Asset Specifications Protocol Activated."
```
