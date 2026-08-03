# 🔍 [던전 수사 조서] 갭 분석 및 게임 완결 로드맵 (Gap Analysis & Completion Roadmap)

| 항목 | 내용 |
|---|---|
| 버전 | v1.0 |
| 작성일 | 2026-08-04 |
| 대상 | `@docs` (기획/개발 정본, 설계서, Phase 프롬프트) vs `@dungeon-dossier` (TypeScript 코드베이스) |
| 목적 | 현재 코드베이스와 정본 명세서 간의 모든 미구현 갭(Gap)을 전수 조사하고, 100% 완결을 위한 개발 로드맵 및 마스터 실행 프롬프트를 제시한다. |

---

## 0. 현재 상태 종합 진단 (Current Status & Audit)

### 0.1 이미 완성된 핵심 엔진 (Green Subsystems)
- **판정 엔진 (`src/engine/resolution/`)**: 10단계 pure `resolveArgument` 및 조합표, 등급 A/B/C 반영, 12 QA 케이스 수용 완료.
- **전투 머신 (`src/engine/encounter/`)**: 8단계 턴 순환 머신, CP/평정심/강압 자원 관리, 스위트스팟(1~30%) 및 종료 판정 구현.
- **지식 및 불변식 (`src/engine/knowledge/`)**: 3축 상태 모델(Commitment/Epistemic/Presentation) 및 불변식 I-1~I-5 assert 구동.
- **DTO 화이트리스트 (`src/dto/`)**: UI 단방향 데이터 투영 및 누설 방지(`hasForbiddenPublicKey`) 검증.
- **엔진 코디네이터 (`src/engine/encounter/EncounterCoordinator.ts`)**: 헤드리스 구동 및 상태 관리 배선 완료.

---

## 1. 전수 갭(Gap) 분석 마트릭스 (100% 전수 조사)

 아래 표는 기획/개발 정본 문서와 현재 `dungeon-dossier/` 코드베이스를 대조하여 발견한 **모든 미구현 갭 목록**입니다.

### 🔴 Category A: 콘텐츠 데이터 갭 (Content & Case JSON Gaps)

| # | 미구현 갭 | 현재 상태 | 정본 요구사항 (개발/기획 정본) | 구현 필요 파일 |
|---|---|---|---|---|
| A-1 | **EP001 (빨간물 횡령) 사건 완결 데이터** | `case.json` 기본 구조만 존재, 대사 미비 | 용의자 3명(고블린/오크/서큐버스) 3전투 데이터, 증거 10종, 필수 주장 3개 | `content/cases/ep001/case.json`, `dialogue.json` |
| A-2 | **EP004 (GATE-04 부실공사) 사건 완결 데이터** | `case.json` 기본 구조만 존재, 대사 미비 | 용의자 3명(드워프/사이클롭스/용사) 3전투 데이터, 증거 14종, 교차검증 규칙 | `content/cases/ep004/case.json`, `dialogue.json` |
| A-3 | **37개 전체 증거 Observation & Scopes 완비** | 튜토리얼 일부만 상세 기재 | 37개 증거 카탈로그 전항목의 `scopes`, `independence`, `notProvenKeys` 100% 명시 | `content/cases/*/case.json` `evidence` 배열 |
| A-4 | **질문 경로 (`inquiry_routes`) 및 비전투 이벤트 (`events_noncombat`)** | 빈 배열 또는 최소 샘플 | 9개 전투의 QUERY 카드 질문 경로 23개 및 비전투 이벤트 6종 인코딩 | `content/cases/*/case.json` |
| A-5 | **폴백 대사 전량 (260~410 문장)** | 샘플 대사만 존재 | 9전투 전 용의자 진술, 판정 리액션(4~5종), 완전진술/강제자백 폴백 전량 | `content/cases/*/dialogue.json` |
| A-6 | **사전 생성 AI 캐시 (`content/ai-cache/`)** | `.gitkeep` | 주요 라운드 및 보스 자백, 최종 논고 검증 통과 캐시 문장 배치 | `content/ai-cache/*.json` |

---

### 🟡 Category B: 런 레이어 & 노드 진행 갭 (Run Layer & Progression Gaps)

| # | 미구현 갭 | 현재 상태 | 정본 요구사항 | 구현 필요 파일 |
|---|---|---|---|---|
| B-1 | **15노드 런 진행 제어기 (`RunCoordinator`)** | `RunState.ts`, `NodeStrip.ts` 분리된 상태 | 노드 0~14 선형 진행, 전투/이벤트 결과 수령, 자동 저장 연동 | `src/engine/run/RunCoordinator.ts` |
| B-2 | **보상 추첨 시스템 (`RewardSystem`) 연동** | 3택1 / 2택 소스만 존재 | 전투 BEST/PARTIAL 종료 후 결정론적 시드 기반 카드/유물 3택1 추첨 | `src/engine/run/RewardSystem.ts` |
| B-3 | **사건 등급 산출기 (`GradeEvaluator`)** | 수식 및 스키마만 존재 | 해결률, 스위트스팟 유지, 원본보존, 강압기록을 조합해 S~F 등급 산출 | `src/engine/run/GradeEvaluator.ts` |
| B-4 | **엔딩 평가기 (`EndingEvaluator`)** | 조건 정의만 존재 | F-13 연계 플래그 및 사건 등급 기반 트루/노멀/배드 엔딩 최종 판정 | `src/engine/run/EndingEvaluator.ts` |

---

### 🔵 Category C: UI 화면 및 연출 갭 (UI Screens & Presentation Gaps)

| # | 미구현 갭 | 현재 상태 | 정본 요구사항 | 구현 필요 파일 |
|---|---|---|---|---|
| C-1 | **15노드 진행 스트립 화면 (`createRunStripScreen`)** | 기본 모델 및 프레임만 존재 | 15노드 선형 아이콘, 클리어 도장, 현재 노드 이동 애니메이션, 클릭 렌더링 | `src/ui/screens/strip/createRunStripScreen.ts` |
| C-2 | **비전투 이벤트 화면 3패턴 (`createEventScreen`)** | 기본 껍데기만 존재 | **A 선택형**, **B 연결·배치형**, **C 제한 조사형** 3패턴 정규화 컴포넌트 완비 | `src/ui/screens/event/createEventScreen.ts` |
| C-3 | **보상 및 정산 화면 (`createRewardScreen`)** | 기본 모델만 존재 | 3택1 서류철 UI, 사건 등급 도장(S~F) ✨쾅 연출, 획득 처리 | `src/ui/screens/reward/createRewardScreen.ts` |
| C-4 | **엔딩 화면 (`createEndingScreen`)** | 기본 모델만 존재 | 엔딩 컷신 표시, 결말 대사 스크립트 타자기 연출, 런 결과 요약 | `src/ui/screens/ending/createEndingScreen.ts` |
| C-5 | **판정 & 결말 5대 특수 연출** | 텍스트 전환만 존재 | 완전 진술 꾸벅 퇴장, 송치 도장 쾅, 강제 자백 BGM 뮤트, 변호인 명함+노크 3연타 | `src/ui/screens/interrogation/` 연출 모듈 |

---

### 🟢 Category D: 애셋 파이프라인 갭 (Visual & Audio Asset Gaps)

| # | 미구현 갭 | 현재 상태 | 정본 요구사항 | 구현 필요 파일 |
|---|---|---|---|---|
| D-1 | **용의자 & NPC 포트레이트 12벌** | 3종만 존재 (물컹이/하피/미노) | 고블린, 오크, 드워프, 사이클롭스, 서큐버스, 타락한 용사, 김태훈, 김인턴, 켄타우로스 9종 추가 | `assets/portraits/portrait_*_base.png` |
| D-2 | **표정 파츠 오버레이 (Parts Overlay)** | 실루엣 플레이스홀더 | 용의자 9명 눈썹/땀/입 표정 파츠 PNG 및 위치 좌표 JSON | `assets/portraits/portrait_*_parts.png` |
| D-3 | **이벤트 컷 4종 & 엔딩 컷 1~3종** | 없음 | 감식 현장, 기록/장부, 거래 제안, 붕괴 현장 공용 컷 4종 + 엔딩 컷 | `assets/bg/event_*`, `assets/bg/ending_*` |
| D-4 | **SFX 사운드 12종** | `.gitkeep` 만 존재 | 타자기, 도장 쾅, 카드 스냅, 종이 넘김, 방어막 파괴, 문 두드림, 노크 3연타, QTE, 파쇄기 등 | `assets/sfx/*.ogg` |
| D-5 | **BGM 음악 4곡 + 스팅어 2종** | `.gitkeep` 만 존재 | 심문 FM 재즈, 보스 브라스, 수사 앰비언트, 엔딩 BGM + 자백/검거 스팅어 | `assets/bgm/*.ogg` |

---

## 🚀 갭 해소를 위한 마스터 실행 프롬프트 (Master Execution Prompt)

아래 프롬프트를 AI 코딩 에이전트에 발주하여 남은 모든 갭을 순차적으로 해결하세요.

```markdown
Act as the Lead Full-Stack Game Engineer & Content Pipeline Director for "[던전 수사 조서] (Dungeon Detective Kim Taehoon)".

Your mission is to resolve ALL 18 identified gaps between the specification documents (`docs/`) and the TypeScript codebase (`dungeon-dossier/`), taking the project from engine-complete to a 100% FULLY PLAYABLE 15-node detective game.

### Execution Task Checklist:

1. **Category A: Content Data Population**
   - Populate `content/cases/ep001/case.json` and `ep004/case.json` with 100% complete evidence, claims, proof rules, encounters, and fallback dialogues.
   - Fill all 37 evidence observation items with exact `scopes`, `independence`, and `notProvenKeys`.
   - Add all 23 inquiry routes (`inquiry_routes`) and 6 non-combat events (`events_noncombat`).

2. **Category B: Run Layer & Node Progression**
   - Build `src/engine/run/RunCoordinator.ts` to manage 15-node linear strip progression.
   - Connect `RewardSystem.ts` for deterministic 3-choice reward draws.
   - Connect `GradeEvaluator.ts` (S~F) and `EndingEvaluator.ts` (True/Normal/Bad endings).

3. **Category C: Complete All 4 UI Screens**
   - Implement `createRunStripScreen.ts`: 15-node map with clear stamps & transition animations.
   - Implement `createEventScreen.ts`: 3 Patterns (A: Choice, B: Connection, C: Inspection).
   - Implement `createRewardScreen.ts`: 3-card reward drawer & S~F grade stamp.
   - Implement `createEndingScreen.ts`: Ending cutscene, typewriter summary, replay log view.
   - Implement 5 special visual FX (Stamp clang, Shield break flash, BGM mute, Attorney knock).

4. **Category D: Asset Binding & Audio**
   - Ensure `assetResolver` gracefully falls back to placeholders while supporting full 12 suspect portraits and expression parts.
   - Bind Howler audio wrapper for 12 SFX events and 4 BGM tracks with BGM mute triggers.

Strictly adhere to the 5-layer architecture rules and ensure `npx vitest run` passes with 100% green rate.
```
