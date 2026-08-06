# 📑 던전 수사 조서: Codex 전용 v2.0 전수 갭 감사, 4대 BLOCKER 해결 & 15노드 무인 자동 플레이 구축 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 OpenAI Codex 또는 AI 코딩 에이전트에 전달하여, `docs/gap_audit_v2_and_autoplay_15node_scenario.md` (v2.0 정본)에 기술된 4대 BLOCKER 결함 수정, 15노드 무인 자동 플레이 드라이버 구축, 미배선 에셋/데이터 연결 및 Vitest 검증을 완결하도록 지시합니다.

```markdown
Role: Principal TypeScript Game Architect & System Integration Engineer
Task: Execute Full Gap Audit v2.0 Remediation, 4 BLOCKER Fixes, and 15-Node Unattended Autoplay Driver Implementation for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 📌 정본 설계 문서 지정 및 준수 지침 (Authoritative Document Binding)

1. **최우선 정본 문서**: `docs/gap_audit_v2_and_autoplay_15node_scenario.md` (v2.0, 2026-08-05)
2. **폐기 대상 문서**: `docs/gap_analysis_and_completion_roadmap.md` (v1.0)
   - ⚠️ **주의**: v1.0 문서의 "미구현" 주장은 구버전 추정이므로 절대 참조하지 마세요. 이미 `RunSession`, `RewardSystem`, `GradeEvaluator`, 3개 사건 데이터(148KB)가 전면 구현되어 있습니다. 본 과업은 "새로 만들기"가 아니라 **"미배선(UNWIRED) 연결 및 4대 BLOCKER 수정"**에 집중해야 합니다.
3. **코드베이스 위치**: `dungeon-dossier/` (`src/`, `tests/`, `workbench/`, `content/cases/`)

---

## 2. 🔴 4대 확정 BLOCKER 수정 (Critical Fixes)

다음 4가지 런타임 영구 정지 결함을 `dungeon-dossier/src/` 코드에 즉시 반영하고 수정을 완료하세요:

### BLK-0. 판정표 78개 조합 누락 예외 수정 & 안전 폴백 구축 (§ 1.1)
- **목표 파일**: `src/engine/resolution/resolutionTable.ts`
- **수정사항**:
  1. `lookupResolutionTableRow` 매칭 실패 시 `throw` 대신 **기본 중립 판정(Safety Fallback Row)**을 반환하도록 개선.
  2. `CONTRADICT/PARTIAL/NEUTRAL/*`, `CONFIRM/PARTIAL/NEUTRAL/*` 등 누락된 78개 조합 행을 판정표에 공식 추가하여 용의자가 영문 에러(`Undefined resolution combination...`)를 말하고 `BUILD_ARGUMENT` 상태로 영구 정지하는 현상 차단.
  3. 비최적 수 제출 시 용의자가 한국어 회피/반박 대사("흠... 그 증거와 이 진술이 무슨 상관이지?")를 출력하며 턴이 계속 진행되도록 안전망 구축.

### BLK-1. 보상 카드 중복 획득 시 세이브 검증 에러 수정 (§ 1.2)
- **목표 파일**: `src/engine/reward/rewardSystem.ts` 및 `src/app/runSession.ts`
- **수정사항**:
  - 동일한 보상 카드를 2회 이상 선택하여 획득할 때 deck/inventory 내의 unique ID 충돌로 인해 세이브 스키마 검증이 실패하는 문제 수정.
  - 카드 획득 시 instance UUID/counter를 부여하여 세이브 데이터 검증 오류 및 보상 선택 화면 영구 멈춤 현상 완벽 해결.

### BLK-2. 한국어 문자열 테이블(i18n) 구축 및 개발자 키 대체 (§ 1.3)
- **목표 파일**: `src/content-io/i18n.ts`, `content/i18n/ko.json`
- **수정사항**:
  - 개발자 raw key(예: `EVENT_CHOICE_INVESTIGATE_DESK`, `ENCOUNTER_INTRO_SLIME` 등약 150개 키)를 한국어 정식 문장으로 변환하는 i18n 딕셔너리 신설.
  - UI 및 대사 렌더러(`DialogueRenderer`)가 i18n 번역 함수 `t(key)`를 거쳐 깨끗한 한국어 문장을 출력하도록 배선.

### BLK-3. 전역 런 예외 UI 에러 배너 구축 (§ 1.4)
- **목표 파일**: `src/ui/widgets/errorBanner.ts` 및 `src/app/createRunSession.ts`
- **수정사항**:
  - 런 진행 중 예외 발생 시 화면 무반응 대신, 상단에 **한국어 알림 에러 배너**("수사 진행 중 오류가 발생했습니다. 이전 상태로 복구합니다.")를 출력하고 안전 재시도 버튼 제공.

---

## 3. 🤖 15노드 무인 자동 플레이 드라이버 구축 (Autoplay Test Harness)

- **목표 파일**: `src/dev/autoPlayHarness.ts`, `src/main.ts`, `tests/routes/autoplay-15node.test.ts`

1. **무인 자동 플레이 엔진 (`autoPlayHarness.ts`)**:
   - 사람이 클릭하지 않아도 **01~15번 노드 전체**(`enc_tutorial_slime` → ... → `enc_ep004_fallen_hero`)를 100% 자동 완주하는 자동화 시험 하네스 작성.
   - **심문 노드 (`enc_*`)**: 사용 가능한 수중 카드를 자동 탐색하여 유효한 카드/증거 조합 제출.
   - **이벤트 노드 (`event_*`)**: 선택지 옵션 중 유효한 첫 번째 옵션 선택.
   - **보상 노드 (`reward_*`)**: 첫 번째 보상 수령.
2. **브라우저/개발 워크벤치 바인딩**:
   - `window.__AUTO_PLAY__ = { start(), stop(), getProgress() }` 글로벌 바인딩 제공 및 `URL?autoplay=true`로 즉시 실행 지원.
3. **Vitest 무인 완주 통합 테스트 (`tests/routes/autoplay-15node.test.ts`)**:
   - Headless 환경에서 15개 노드를 연속 자동 실행하고, 0개 예외 throw 및 `RUN_COMPLETED` 최종 엔딩 도달을 100% 자율 검증.

---

## 4. 🛠️ 미배선 데이터 및 UI 기능 완결 (Un-wired Data & UI Wiring)

1. **파트너 쿨다운 배선**: `balance.json` 내 `partner.cooldowns` 미배선 수정. `used` (512x512, 턴 카운트다운) → `base` (512x512, 재활성화) 정상 구동.
2. **용의자 상태 파츠 배선**: `expression` → `stateParts` (`base`, `upset`, `lose`) 512x512 이미지 슬롯 바인딩 및 평정심 상태 연동.
3. **5계층 카드 UI 배선**: `base(640x725)`, `illust(256x256)`, `stamp`, `post`, `evidence(128x128)` 5-Layer 순차 Z-Index 중첩, 상단 20% → 40% 호버 슬라이드, 클릭 시 전체화면 640x725 모달, 태그 드래그 앤 드롭 점선 연결 구현.
4. **에셋 워크벤치 기즈모**: `workbench/` 상의 이미지 이동/회전/크기 조절 드래그 기즈모 및 고정(Lock toggle, `isLocked`) 데이터 보존 기능 완성.

---

## 5. 🧪 전수 검증 및 품질 합격 기준 (Quality Gates)

다음 4가지 검증 명령을 순차 실행하여 100% 통과(Exit Code 0)를 확인하고 최종 보고하세요:

```bash
# 1. 타입 검사 (0 errors)
npx tsc --noEmit -p tsconfig.json

# 2. 전수 단원/통합/자동플레이 테스트 (470+ tests 100% Green)
npx vitest run

# 3. JSON 무코드 콘텐츠 무결성 검사
node tools/validate/index.mjs

# 4. Vite 프로덕션 번들 빌드
npx vite build
```

Acknowledge these task specifications and reply: "Codex Gap Audit v2 & 15-Node Autoplay Implementation Protocol Activated."
```
