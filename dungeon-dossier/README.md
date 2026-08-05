# 던전 수사 조서

TypeScript, Vite, PixiJS로 구축하는 데이터 기반 추리 카드 게임입니다. 사건·카드·밸런스·대사는 `content/`, 교체 가능한 리소스는 `assets/`에서 로드하며, 새 사건을 추가할 때 `src/engine/`을 수정하지 않는 것을 핵심 계약으로 둡니다.

## 개발 환경

- Node.js 20.19 이상, 20.x 고정
- pnpm 11.18.0
- Chrome 최신 버전

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

전체 Phase 1~5 게이트는 `pnpm check`로 실행합니다.

| 명령 | 역할 |
|---|---|
| `pnpm build` | Vite 프로덕션 빌드와 `content/`, `assets/`, `schemas/` 복사 |
| `pnpm typecheck` | 브라우저·Node TypeScript strict 검사 |
| `pnpm lint` | ESLint 및 엔진 금지 API 검사 |
| `pnpm arch` | dependency-cruiser 계층 검사 |
| `pnpm test` | Vitest 회귀 검사 |
| `pnpm test:gates` | PR용 단위·계약 게이트(27셀 전체 제외) |
| `pnpm content:validate` | Zod 스키마와 T1~T3 의미·도달성·누설 검사 |
| `pnpm placeholder:generate` | 누락 애셋용 16색 이하 실루엣 PNG 생성(기존 파일은 보존) |
| `pnpm schema:export` | Zod 단일 원본에서 Draft 2020-12 JSON Schema 10종 생성 |
| `pnpm palette:check` | PNG당 보이는 RGBA 색상 16색 제한 검사 |
| `pnpm simulate:smoke` | BEST·플래그·결정론적 리플레이 스모크 검사 |
| `pnpm simulate:full` | 9개 조우 × 3개 결과의 27셀 전체 검사 |

## 계층 계약

```text
TruthGraph/domain
        ↓
KnowledgeState
        ↓
GameRule (resolution/cards/encounter/run)
        ↓
PublicDTO + Dialogue actor
        ↓
PixiJS Presentation
```

- 엔진이 판정하고 AI는 판정 이후의 표현만 담당합니다.
- 실제 진실과 플레이어의 지식 상태를 분리합니다.
- UI는 엔진 객체가 아니라 명시적으로 조립된 `PublicDTO`만 받습니다.
- 판정 상태 전이는 `ResolutionEffectApplier`, 기믹 전이는 `ModifierSystem`에 모읍니다.
- 엔진은 PixiJS, Howler, DOM, `fetch`, 실시간 시각, 비결정적 난수를 사용할 수 없습니다.
- 모든 무작위성은 `run_seed`에서 용도별로 파생한 스트림을 사용합니다.

이 경계는 ESLint, dependency-cruiser, Vitest 아키텍처 검사로 CI에서 강제됩니다. `app/`만 데이터 로딩, 엔진, DTO, AI 표현, UI를 연결하는 조합 루트입니다.

## 콘텐츠와 애셋

Vite 개발 서버는 프로젝트 루트의 `content/`, `assets/`, `schemas/`를 제공합니다. 프로덕션 빌드도 세 디렉터리를 `dist/` 아래에 복사하며 번들 파일은 `dist/_app/`에 둡니다.

PNG 파일명은 `카테고리_이름_상태.png` 규칙을 따릅니다. 색 변형은 런타임 셰이더가 아니라 미리 제작한 시안·세피아·마젠타 PNG를 사용합니다.

## Phase 2 심문 UI와 애셋 워크벤치

- 게임: 개발 서버의 `/`에서 640×400 PixiJS 심문 화면을 실행합니다. 마우스로 카드→태그→조서 증거→제출 흐름을 완료할 수 있고, 숫자 키와 Space는 보조 입력입니다.
- 워크벤치: `/workbench/`에서 16개 PNG 슬롯, `localStorage` 복원, Tweak Mode, 포트레이트 파츠 JSON 내보내기를 사용할 수 있습니다. 이 페이지는 게임 런타임에 import되지 않는 별도 Vite 진입점입니다.
- 워크벤치에서 내려받은 PNG는 `assets/`로 옮겨야 게임 레지스트리에 포함됩니다. 런타임 업로드 경로와 수기 매니페스트는 없습니다.
- 한글 도트 글꼴은 [Galmuri11](https://github.com/quiple/galmuri)을 로컬 번들로 사용합니다. 라이선스는 SIL Open Font License 1.1이며 원문은 `assets/fonts/OFL-Galmuri.md`에 포함했습니다.

## Phase 3 개발자 콘솔과 라이브 튜너

개발 서버의 게임 화면에서 Backquote 키를 누르면 개발자 콘솔이 열립니다. 이 키 외의 단축키는 콘솔을 열지 않으며 프로덕션 빌드에는 콘솔 모듈, 스타일, 내부 truth overlay가 포함되지 않습니다. Vite 빌드 플러그인이 이 물리적 제거를 번들 생성 시 검사합니다.

- 라이브 밸런스: 런타임 fetch로 읽은 `balance.json` 전체 카탈로그 편집, Zod 검증 후 현재 턴에 즉시 적용, JSON 내려받기, 디스크 스냅샷과의 차이 표시
- 사건·대사: Claim, Evidence observation/proof scope, ReactionKey 폴백 탐색과 편집, 무대 타이프라이터 재생, T1–T2 및 A-6 실시간 검사
- QA: production resolver로 12개 게이트 픽스처를 개별/일괄 재생하고 결과 코드와 5개 판정 축을 함께 단언
- 런타임: 자원 치트, 노드 점프, AI 즉시 on/off, QTE 자동 성공, F-01~F-13 플래그, 개발 전용 truth overlay
- 로그: P2 제출과 QA 결과의 `JudgmentLog` 확인·초기화·JSON 내보내기

`JSON 내보내기`는 파일을 내려받을 뿐 저장소의 `content/common/balance.json`을 직접 덮어쓰지 않습니다. 내려받은 파일을 검토해 저장소로 옮길 때까지 diff 표시가 유지됩니다.

## Phase 4 상태 머신과 AI 폴백

- 19개 실행 상태와 종료 상태를 순수 전이로 관리하며, 8단계 기획 턴이 실제 상태를 빠짐없이 한 번씩 덮는지 시작 시 검사합니다.
- `FREE_REVIEW`는 복제·동결한 증거 범위, 입증 불가 항목, 비용과 진술 이력만 조회합니다. 판정 예측이나 정답 조합은 API에 존재하지 않습니다.
- 턴 시작 시 CP 복원, 카드 드로우, 상태·쿨다운 감소를 원자적으로 처리합니다. 사이클롭스는 증인 보호 전까지 CP가 2로 제한됩니다.
- Outcome은 실패 → 강제 자백 → BEST 조건/진술 확보 선택 → 부분 해결 순으로 평가합니다. BEST 조건 충족은 버튼만 활성화하며 자동 종료하지 않습니다.
- FlowNode는 Claim 지식 상태로만 전이하며, 기믹은 고정 Trigger/Condition/Effect 카탈로그와 seed 기반 선택만 사용합니다. 증거 제거는 전후 해결 경로 검사를 통과해야 합니다.
- AI 요청은 허용 Claim과 표현 정보만 받습니다. 캐시를 먼저 재생하고, 개발 프록시 AI는 타임아웃 또는 7단계 검증 실패 시 한 번 재시도한 뒤 사전 작성 폴백으로 전환합니다.
- 정적 배포는 AI-off P0이며 API 키를 받는 브라우저 타입이나 옵션이 없습니다. AI 생성 메타데이터는 `GenerationLog`에만 기록되고 엔진 `JudgmentLog`에는 들어갈 수 없습니다.

AI 타임아웃 `PHASE4_DIALOGUE_CONFIG.timeoutMs`는 정본 수치가 확정되지 않은 초안 설정입니다. 라이브 AI를 사용할 때는 `/api/dialogue`와 같은 동일 출처 개발 프록시를 연결하며, 프롬프트 실패율이 10%를 초과하면 검증기를 완화하지 않고 프롬프트를 수정합니다.

Phase 1은 Zod 기반 콘텐츠·저장 스키마, JSON Schema 내보내기, fetch 저장소, T1 검증기, 10단계 순수 판정 Resolver와 고정 순서 효과 적용기를 제공합니다. 판정 조합표 전 행·명시적 예외, QA 12픽스처, 등급·독립성·시간 충돌·누설·결정론 회귀는 Vitest에서 상시 검증합니다.

## Phase 5 자동 검증

- `pnpm test:gates`: 판정·누설·AI 계약·아키텍처와 일반 단위 게이트
- `pnpm content:validate`: 스키마/참조 T1, 도달성/해결 가능성 T2, 누설/AI/플래그 T3
- `pnpm simulate:smoke`: 9개 BEST 경로, 13개 플래그 on/off, 결정적 리플레이
- `pnpm simulate:full`: nightly 9개 조우 × 3개 결과(27셀)

Push/PR CI는 빠른 P0 6단계 게이트를 실행합니다. 27셀 전체는 nightly로 분리되며 조우별 1초, 전체 5분 예산을 테스트가 강제합니다.
