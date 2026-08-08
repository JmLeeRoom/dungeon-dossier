# 🏗️ 던전 수사 조서 — 임의 스케일링·컷씬 엔진·비전투 이벤트 3종·데드씬·1280×321 책상 구현 설계서

| 항목 | 내용 |
|---|---|
| 문서 ID | `docs/design/event_system_custom_scale_deadscene_design.md` |
| 버전 | v1.3 (2026-08-07, 최후 전수감사·무결성 보강판) |
| 대상 코드베이스 | `dungeon-dossier/` — **2026-08-07 현재 작업 트리 실측. 미커밋 구현을 포함하므로 파일명·심볼을 기준으로 삼고 line number는 참고값으로만 사용한다.** |
| 선행 규격 | `docs/phase/prompt_event_custom_scale_deadscene_design.md` (5대 확장 요구 명세) |
| 자매 문서 | `docs/design/card_contradiction_workbench_design.md` (카드·모순·워크벤치 파츠) |
| 전체 검증 게이트 | `cd dungeon-dossier` 후 `corepack pnpm check` + `corepack pnpm schema:export` + `corepack pnpm simulate:full`; 상세 개별 명령은 §5.4 |

---

## 2026-08-07 구현 대조 감사 결론

아래에서 **부분 완료**는 재사용할 기반만 존재한다는 뜻이며, 본 문서의 신규 타입/파일/테스트를 이미 구현했다는
뜻이 아니다. 이후 절의 코드 블록은 `현재`라고 명시한 경우를 제외하면 target 계약이다.

| 요구 기능 | 현재 상태 | 확인된 기반 | 닫히지 않은 핵심 조건 |
|---|---|---|---|
| 임의 크기·비율 유지 | **부분 완료** | manifest v2의 x/y/rotation/scaleX/scaleY, workbench move/rotate/scale | customWidth/Height·aspect 편집/마이그레이션, 승인 manifest runtime consumer, 0.5 grid 왕복 없음 |
| 이벤트 컷씬 | **미구현** | 12종 timed direction overlay와 ticker host | 입력 대기/choice/branch/skip/cancel, semantic validator, CUTSCENE autoplay scene 없음 |
| D/E/F 비전투 이벤트 | **미구현** | A/B/C schema·UI·run reducer | strict run cost/effect, persistent tuning/topic/evidence grade/route, EventDraft 1회 커밋, 화면·autoplay 없음 |
| 데드씬·재시도 | **미구현** | FAILED evaluation, ending 화면, 기술 오류 재시도 경계 | pre-commit dead scene, 5사유 app projection, RETRY 무변경/TERMINATE 1회 커밋, audio/assets 없음 |
| 1280×321 책상 | **미구현** | 1280×236 source와 640×118 logical slot | 1280×321 asset, 640×160.5/239.5/205.5 배치, anchor·pixel/browser 회귀 없음 |
| save/i18n/autoplay 교차 계약 | **미구현** | save v1, 15노드·9 encounter 기준선, 현재 scene/report | save v2 의미 검증, 신규 문자열 수집, A~F+CUTSCENE+DEAD driver/report가 필요 |

현재 코드의 기존 자동 게이트가 통과한다는 사실은 위 target 기능의 PASS 증거가 아니다. §5의 신규 회귀와 실제
브라우저 증거까지 모두 충족한 뒤에만 각 행을 완료로 바꾼다.

| 선행 명세 | 설계/구현 계약 | 자동 인수 |
|---|---|---|
| R1 임의 이미지 크기·비율 | §1.2~1.3, §2.1~2.2 | T-1/T-2 + workbench/runtime browser |
| R2 이벤트 컷씬·선택 분기 | §1.6, §3.1~3.2 | T-4/T-8/T-12 + cutscene browser |
| R3 D/E/F 이벤트 | §1.4~1.5, §3.3~3.6 | T-4~T-7/T-12 + save/reload browser |
| R4 데드씬·retry/record | §4 전체 | T-9/T-10/T-12 + forced-failure browser |
| R5 1280×321 desk/card/pouch/Z-order | §2.3~2.8 | T-3 + 1280×800 screenshot/pointer |

---

## 0. 실측 기준선 — "이미 있는 것"과 "만들 것"의 경계

> 이 절은 착수 전 반드시 읽어야 한다. **5대 요구 중 3개는 신규 서브시스템이 아니라 기존 서브시스템의 증축**이며,
> 명세/초안 중 핵심 5곳은 실제 코드·세이브·오토플레이 계약과 어긋나 있어 그대로 구현하면 안 된다(§0.3).

### 0.1 이미 존재하는 자산 (증축 대상)

| 영역 | 실측 사실 | 근거 |
|---|---|---|
| 에셋 변형 | `AssetTransformSchema = { x, y, rotation(rad), scaleX, scaleY }` — **`scaleX/scaleY`는 이미 존재하고 `PositiveScale`(0 초과 64 이하)로 검증됨.** 없는 것은 *절대 크기* 지정(`customWidth/Height`)과 *비율 유지 플래그* | `assetManifest.ts#AssetTransformSchema` |
| 에셋 매니페스트 | `AssetManifestSlot = { dimension, image, transform, isLocked }`, `AssetManifestSchema{ schema_version:'2.0', stage{640×400/1280×800/×2}, slots }`. 단, 현재 소비자는 워크벤치 내보내기와 테스트뿐이며 **인게임 런타임 로더는 없다.** 따라서 “왕복”은 아직 성립하지 않는다 | `src/ui/core/assetManifest.ts`, `rg parseAssetManifest` |
| 저작 치수 단일 진실원 | `ASSET_DIMENSIONS` 10종. `desk_foreground: { width: 1280, height: 236 }` | `assetDimensions.ts#ASSET_DIMENSIONS` |
| 치수 검증 헬퍼 | `matchesAssetDimension` · `matchesAssetAspectRatio` · `assertAssetDimension` 3종 존재. **단, 런타임 호출처 0건 — 전부 `tests/ui/assetDimensions.test.ts`에서만 호출됨** | `assetDimensions.ts`의 세 export |
| 워크벤치 | `workbench/{model,main,image-slot}.mts` — 고정 16슬롯(`SLOT_IDS`), 드래그 `move/rotate/scale` 3모드, `asset_manifest.json` 내보내기. 저장 **키**는 `.v2`지만 문서 버전은 이미 `WORKBENCH_STATE_VERSION = 3`이며, 키는 마이그레이션을 위해 의도적으로 고정돼 있다 | `model.mts#WORKBENCH_STORAGE_KEY/WORKBENCH_STATE_VERSION` |
| 연출 오버레이 런타임 | `TimedDirectionOverlay extends ManagedUiLayer { durationMs, elapsedMs, complete, update(deltaMs) }` + `DirectionRendererOptions{ assets, audio, durationMs }` + 렌더러 12종. **컷씬 엔진의 기반이 이미 있다** | `directions.ts#TimedDirectionOverlay` |
| 오버레이 구동기 | `showTimedDirection(overlay, onComplete?)` — ticker에 `overlay.update(deltaMS × directionTimeScale)` 등록, `complete` 시 해제 + 콜백. 중단 시 `queueMicrotask`로 콜백 보장 | `bootstrap.ts#showTimedDirection` |
| 기존 대사 서비스 | 명세에 적힌 `phase4-dialogue-service.ts`는 없고 실제 파일은 `src/app/createPhase4DialogueService.ts`다. 이 서비스는 심문용 안전 AI/fallback 대사 파이프라인이지 컷씬 beat/choice 상태 머신이 아니므로, 컷씬 host로 재사용하지 않고 문자열 조립 방식만 참고한다 | `createPhase4DialogueService.ts`, `createEncounterSession.ts` |
| 연출 선택 테이블 | `RESOLUTION_DIRECTION_TABLE`(판정 21종→5종) · `OUTCOME_DIRECTION_TABLE`(종료 5종→5종). **렌더러가 코드로 분기하지 않고 데이터로 선택** | `src/ui/screens/interrogation/directionTable.ts` |
| 비전투 이벤트 | `NonCombatEventSchema = discriminatedUnion('pattern', [A:ChoiceEvent, B:PlacementEvent, C:InvestigationEvent])`, 공통 `NonCombatBaseShape{ event_id, node, title_key, description_key }` | `case.ts#NonCombatEventSchema` |
| 이벤트 적용기 | `applyEventDefinition(state, node, input)` — A/B/C 분기. `applyRunCost` → `applyRunEffects` 순 | `src/engine/run/RunState.ts` |
| 런 이펙트 적용기 | `applyRunEffects`는 **`GRANT_EVIDENCE`와 `ADJUST_RESOURCE`(stress/dp/trust)만 처리**하고 나머지 30종 EffectType은 조용히 무시(`continue`) | `src/engine/run/RunState.ts` |
| 이벤트 화면 | `createEventScreen(model, callbacks)` — 패턴 A/B/C 모두 사각 버튼 목록. 콜백 `onChoice/onPlacementSubmit/onInvestigate/onContinue` | `src/ui/screens/event/createEventScreen.ts` |
| 패배 판정 | `evaluateOutcome`이 **`FAILED` + 자원/경로 사유 4종**을 산출한다. 별도로 coordinator의 즉시 판정 실패는 `FAILED/NONE`을 만들 수 있다 | `OutcomeEvaluator.ts#evaluateOutcome`, `EncounterCoordinator#resolveSubmission` |
| 엔딩 화면 | `createEndingScreen(model, assets, onFinish)` + `EndingScreenModel{ endingId, kind:'TRUE'\|'NORMAL'\|'BAD', title, script[], illustrationAssetKey? }` | `src/ui/screens/ending/` |
| 흐름 에러 경계 | `src/app/flowErrorBoundary.ts` — 실패한 **기술 작업**을 같은 콜백으로 재실행하는 경계다. 이미 커밋된 경계를 재실행하지 않는 것이 계약이므로, 게임 규칙인 데드씬/체크포인트 재시도와 공유하면 안 된다 | `src/app/flowErrorBoundary.ts` |
| i18n | `installStrings()` / `t(key, fallback)` 싱글턴 + 현재 `content/common/strings.ko.json` **322키**. 신규 키 수는 고정 숫자가 아니라 검증 시점 실측으로 관리한다 | `src/app/i18n.ts`, `content/common/strings.ko.json` |
| 런 상태 | `RunState{ nodeIndex, stress, dp, trust, deck{draw/hand/discard/exhaust}, acquiredRelicIds, acquiredEnhancementIds, acquiredEvidenceIds, flags, runSeed, rewardSeedStream, falseConfessions, completedNodeIds, pendingRewardIds, claimedRewardIds, gradeHistory, outcomeHistory, terminal }` | `src/engine/run/RunState.ts` |
| 세이브 | `SaveSchema` 현행 `save_version: 1` + `SavedRunStateSchema`(optional, legacy 호환). `migrateSave` 존재 | `save.ts#SaveSchema/migrateSave` |

### 0.2 아키텍처 불변 조건 (전 기능 공통)

1. **계층 의존성** — `src/ui/**`는 `src/engine/**`을 import 금지(`tests/arch/layer-imports.test.ts`). 엔진 타입이 필요한 조립은 전부 `src/app/`이 한다.
2. **엔진 금지 API** — `src/engine/**`에서 `pixi.js`·`howler`·`window`·`document`·`fetch`·`Date.now`·`Math.random` 금지.
3. **R-6** — `src/engine/**`에 `case_|clm_|ev_|ent_|enc_` 리터럴 0건(`tests/arch/no-hardcoded-content-ids.test.ts`).
4. **전투 상태 변경 지점 2곳** — `ResolutionEffectApplier`, `ModifierSystem`. 이 제한은 `EncounterRuntimeState`에만 적용한다. 런 상태는 이미 `completeEncounterNode`·`completeEventNode`·`claimRunReward`라는 별도 순수 리듀서가 소유하므로, 신규 이벤트 변경도 반드시 이 런 리듀서 경계 안에서만 수행한다.
5. **화이트리스트 DTO** — 전투 상태가 UI로 나가는 경로는 `toPublicDTO` 하나.
6. **dev 격리** — `vite.config.ts`의 `assertDeveloperConsoleTreeShaken`이 프로덕션 번들에 `src/dev/**` 모듈 유입 시 빌드를 실패시킨다.
7. **정수 루트 스케일** — 내부 640×400, `DEFAULT_TARGET_SCALE = 2` → 1280×800. source가 canonical logical
   rect의 정확히 2배이고 추가 비정수 transform이 없을 때만 저작 PNG 1px = HD 1px이다. 임의 크기·회전에도 이 등식을
   일반화하지 않으며 §2.2의 진단 계약을 따른다.

### 0.3 ⚠️ 명세와 코드가 어긋나는 핵심 지점 — 그대로 구현하면 안 됨

| # | 명세 문구 | 실제 코드 | 본 설계의 처리 |
|---|---|---|---|
| **D-1** | "형사 스트레스(Stress) **100% 달성** 시 데드씬 발동" | `stress`는 **100에서 시작해 0으로 소진**되는 잔량 자원이다. `OutcomeEvaluator.ts`는 `resources.stress <= 0`일 때 `FAILED/STRESS_DEPLETED`를 낸다 | 극성을 코드 기준으로 확정한다. 트리거는 `terminalOutcome === 'FAILED'`다 |
| **D-2** | "책상 전경 규격을 **1280×321 px**로 변경" | 321/2는 **160.5 논리 px**다. Pixi 좌표와 현 스키마는 유한 실수를 허용하며, 루트 ×2에서 0.5 논리 px는 정확히 1 HD px가 된다. 정수만 허용하는 것은 현재 워크벤치 `clampRect` 구현의 제약일 뿐 렌더러 제약이 아니다 | `640×160.5`, `y=239.5`를 채택한다. **왜곡도 1px 절상도 하지 않는다.** 워크벤치 기하를 0.5 격자로 확장한다(§2.3) |
| **D-3** | `FAILED` 사유는 4종뿐이다 | 자원/경로 실패는 4종이지만 `EncounterCoordinator`는 판정 자체가 즉시 실패하면 `terminalOutcome:'FAILED', reason:'NONE'`을 만들 수 있다 | `DeadSceneReason`에 `PROCEDURAL_FAILURE` 폴백을 두고 `FAILED/NONE`을 정규화한다. 테이블 조회가 `undefined`가 되는 경로를 금지한다(§4.1) |
| **D-4** | 컷씬은 기존 `showTimedDirection`을 그대로 쓸 수 있다 | 구동기는 `durationMs` wall-clock 타이머 만료 시 `completePlayback()`을 강제 호출하고, 중단 `onDestroy`도 완료 콜백을 실행한다. 선택 대기·취소·분기에는 부적합하다 | 기존 타임드 오버레이는 유지하고, 입력 대기를 아는 **시퀀스 호스트**를 별도로 둔다(§3.1) |
| **D-5** | 실패를 `outcomeHistory`에 기록한 뒤 `terminal:false`로 재시도한다 | 세이브 의미 검증은 현재 노드의 마지막 `FAILED`를 곧바로 terminal로 간주하고, 중간 `FAILED` 뒤 진행을 명시적으로 거부한다 | RETRY는 `finishEncounter` 전에 encounter-local 상태를 폐기하므로 RunState/save/history를 전혀 바꾸지 않는다. `[진행 기록으로]`(TERMINATE)만 최종 `FAILED`를 1회 기록한다(§4.4~4.5) |

---

## 1. Section 1 — Architecture & Zod Schema Changes

### 1.1 스키마 변경 총괄

| # | 스키마 | 변경 | 파일 |
|---|---|---|---|
| S-1 | `AssetTransformSchema` | `customWidth?`·`customHeight?`·`preserveAspectRatio` 3필드 추가 | `assetManifest.ts#AssetTransformSchema` |
| S-2 | `ASSET_MANIFEST_SCHEMA_VERSION` / 워크벤치 저장 | 매니페스트 `'2.0'` → `'3.0'` + v2 마이그레이터 + checked schema export. 워크벤치 문서 `3 → 4`; **localStorage 키 `.v2` 유지** | `src/ui/core/assetManifest.ts`, `schemas/asset-manifest.schema.json`, `workbench/model.mts` |
| S-3 | `ASSET_DIMENSIONS.desk_foreground` | `{1280, 236}` → `{1280, 321}` | `assetDimensions.ts#ASSET_DIMENSIONS` |
| S-4 | `NonCombatEventSchema` | 판별 유니온에 `D:EnhanceCardEvent` · `E:CanvassEvent` · `F:CollectEvidenceEvent` 3종 추가 | `case.ts#NonCombatEventSchema` |
| S-5 | `CutsceneSchema` (신규) | 컷씬 비트 시퀀스 정의 | `src/engine/domain/schemas/cutscene.ts` (신규) |
| S-6 | `NonCombatBaseShape` | `cutscenes: CutsceneSchema[]` 추가 (기본 `[]`, 최대 2개, timing별 최대 1개; 전 패턴 공통) | `case.ts#NonCombatBaseShape` |
| S-7 | `RunState` | `cardTuning` · `canvassedTopicIds` · `evidenceGradeById` · `openRouteIds` 추가 | `src/engine/run/RunState.ts` |
| S-8 | `SavedRunStateSchema` / `SaveDataV2Schema` | S-7 필드는 saved run에, save-only `run_contract_fingerprint`는 envelope metadata에 추가 + `CURRENT_SAVE_VERSION = 2` + 실제 v1→v2 마이그레이터. `card_tuning`은 덱 컨테이너가 아니라 런 상태에 둔다 | `src/engine/domain/schemas/save.ts`, `src/app/save/runContractFingerprint.ts` (신규) |
| S-9 | `DEAD_SCENE_TABLE` + app projection (신규) | `DeadSceneReason` **5종** → 프리셋 key 매핑 → 로컬라이즈된 UI `DeadSceneView` | `src/ui/screens/ending/deadSceneTable.ts`, `src/app/deadScenePresentation.ts` (신규) |
| S-10 | `RunEventCostSchema` / `RunEffectSchema` (신규) | 이벤트 비용을 `stress/dp/trust`로 좁히고, 효과를 5종으로 좁혀 필수 payload를 타입으로 강제 | `src/engine/domain/schemas/runEvent.ts` (신규; `case.ts`/`cutscene.ts`가 단방향 import) |
| S-11 | 공용 slot catalogue + 런타임 매니페스트 로더 | `assets/manifests/asset_manifest.json` 승인본을 parse해 transform을 공급. Slot 계약은 공용 core, 파일 로드는 app에 두며 localStorage는 읽지 않음 | `src/ui/core/assetSlots.ts`, `src/ui/core/runtimeAssetManifest.ts`, `src/app/RuntimeAssetLayoutRepository.ts` (신규) |

버전 축은 서로 독립이며 다음처럼 고정한다. 자매 문서도 같은 값을 사용해야 한다.

| 문서/저장물 | 현행 → 목표 | 책임 |
|---|---|---|
| 워크벤치 localStorage document | `WORKBENCH_STATE_VERSION 3 → 4` | 캐릭터 레이어/used sidecar 상태와 slot sizing/aspect를 **하나의 v4 구조**로 합침. 키 `.v2` 유지 |
| `asset_manifest.json` | `2.0 → 3.0` | 런타임 슬롯 transform |
| portrait state-parts sidecar | `2.0 → 3.0` | 자매 카드/파츠 설계가 소유 |
| 게임 save envelope | `CURRENT_SAVE_VERSION 1 → 2` | 런 이벤트 튜닝·탐문·증거 등급·개방 경로 상태 + 전체 런 계약 지문(재시도 상태는 저장하지 않음) |

워크벤치 document v4와 asset/portrait/save 버전을 같은 숫자라고 같은 스키마로 취급하거나, 각 기능이 서로 다른
`WORKBENCH_STATE_VERSION = 4` 모양을 정의해서는 안 된다. v4 타입과 migration은 워크벤치 모델 한 곳에서 합친다.

### 1.2 S-1 · AssetTransform 확장

```ts
// src/ui/core/assetManifest.ts
const FiniteNumber = z.number().finite();
const PositiveScale = FiniteNumber.gt(0).max(64);
/** Explicit on-stage size in the 640x400 grid. Overrides scaleX/scaleY when set. */
export const MIN_LOGICAL_ASSET_SIZE = 0.5;
export const MAX_LOGICAL_ASSET_SIZE = 4096;
const PositiveSize = FiniteNumber.min(MIN_LOGICAL_ASSET_SIZE).max(MAX_LOGICAL_ASSET_SIZE);

export const AssetTransformSchema = z
  .strictObject({
    x: FiniteNumber,
    y: FiniteNumber,
    rotation: FiniteNumber,
    scaleX: PositiveScale,
    scaleY: PositiveScale,
    /** When present, wins over scaleX/scaleY. Absent = pure scale placement. */
    customWidth: PositiveSize.optional(),
    customHeight: PositiveSize.optional(),
    /** Aspect lock. Default true keeps every existing slot's behaviour. */
    preserveAspectRatio: z.boolean().default(true),
  })
  .superRefine((t, context) => {
    const count = Number(t.customWidth !== undefined) + Number(t.customHeight !== undefined);
    if (count === 1 && !t.preserveAspectRatio) {
      context.addIssue({ code: 'custom', message: 'one custom dimension requires aspect lock' });
    }
    if (count === 2 && t.preserveAspectRatio) {
      context.addIssue({ code: 'custom', message: 'two custom dimensions require aspect unlock' });
    }
  });
```

**해석 규칙 (`resolveTransformSize`, 신규 순수 함수)** — 렌더러·워크벤치가 공유하는 단일 계산기:

| 입력 | 결과 |
|---|---|
| `customWidth`·`customHeight` 둘 다 있음 (`preserveAspectRatio:false` 필수) | 그대로 사용. **왜곡 허용** |
| `customWidth`만 있음 + `preserveAspectRatio:true` | `height = customWidth / assetAspectRatio(dimension)` |
| `customHeight`만 있음 + `preserveAspectRatio:true` | `width = customHeight × assetAspectRatio(dimension)` |
| 둘 다 없음 | `width = source.width × scaleX`, `height = source.height × scaleY` (**기존 동작 그대로**, 플래그는 이후 편집 제스처에만 영향) |
| 한 축만 있음 + 잠금 해제 / 두 축 있음 + 잠금 | **스키마 오류**. 암묵적 나머지 축 계산을 금지 |

> `customWidth/Height`가 없을 때는 기존 독립 `scaleX/scaleY`를 그대로 쓰므로 렌더 결과가 유지된다.
> 다만 **편집 의미까지 보존**하려면 v2 마이그레이션에서 `scaleX !== scaleY`인 슬롯은
> `preserveAspectRatio:false`, 같은 슬롯은 `true`로 정규화해야 한다.

`PositiveScale.max(64)`만으로는 1280px source가 81,920 logical까지 커질 수 있다. 따라서 slot dimension을 아는
`AssetManifestSlotSchema`/semantic validator가 `resolveTransformSize()` 결과의 두 축도
`MIN_LOGICAL_ASSET_SIZE <= size <= MAX_LOGICAL_ASSET_SIZE`로 검증한다. workbench scale 입력 범위 역시
`0.5/sourceDimension .. min(64, 4096/sourceDimension)`에서
파생해 schema와 UI가 서로 다른 범위를 허용하지 않게 한다.

### 1.3 S-2 · 매니페스트 v3 마이그레이션

```ts
export const ASSET_MANIFEST_SCHEMA_VERSION = '3.0';

/** v2 slots carry no size fields; legacy scales remain authoritative. */
export function migrateAssetManifest(input: unknown): AssetManifest { /* 2.0 → 3.0 */ }
```

v2의 `slots: Record<string, Slot>`는 JSON parser가 같은 key의 앞 항목을 덮어써 **중복 slot 검증이 원천적으로
불가능**하다. build-time JSON import 뒤에는 raw 중복 정보를 복구할 수도 없다. 따라서 승인 manifest v3는 다음처럼
명시적 `slot_id` 배열로 바꾼다.

```ts
const AssetManifestSlotV3Schema = z.strictObject({
  slot_id: z.enum(ASSET_SLOT_IDS),
  dimension: z.enum(ASSET_DIMENSION_IDS),
  image: z.string().trim().min(1).nullable(),
  transform: AssetTransformSchema,
  isLocked: z.boolean(),
});

export const AssetManifestV3Schema = z.strictObject({
  schema_version: z.literal('3.0'),
  stage: AssetManifestStageSchema,
  slots: z.array(AssetManifestSlotV3Schema).length(ASSET_SLOT_IDS.length),
}).superRefine(assertEverySlotExactlyOnce);
```

v2 migration은 record를 canonical `ASSET_SLOT_IDS` 순서의 배열로 올리고, v3 serializer도 그 순서로만 출력한다.
v3 parser는 unknown ID를 enum에서, duplicate/missing ID를 `assertEverySlotExactlyOnce`에서 거부한 뒤에만 lookup Map을
만든다. v2 raw JSON의 과거 중복 key까지 검출한다고 주장하지 않으며, 승인본을 v3 배열로 재저장해 이후부터 보장한다.

`WORKBENCH_STORAGE_KEY = 'dungeon-dossier.asset-workbench.v2'`는 **바꾸지 않는다.** 코드 주석대로 이 값은
문서 버전이 아니라 영속 슬롯 이름이다. `WORKBENCH_STATE_VERSION`을 현행 3에서 4로 올리고 같은 키에서 읽은
v3 문서를 변환한 뒤 v4로 재기록한다. 별도 키로 올리면 기존 사용자의 배치가 고아가 된다.

마이그레이션은 `v2 → character migration 의미의 v3 → character transform/layer + slot sizing을 합친 v4`의
한 파이프라인으로 작성하되, 현 v2→v3 구현의 `finiteInteger/Math.round`는 exact finite authored-offset helper로
리팩터링한다. 중간 저장물을 실제로 재직렬화해 정밀도를 잃지 않는다. 카드용 v4와 sizing용 v4를 따로 만들거나 v2에서
서로 다른 두 direct migrator를 호출하지 않는다. v4는 idempotent no-op이어야 한다. `version > 4`는 malformed로 오인해 초기화/덮어쓰기 하지 말고 읽기 전용
오류를 표시해 더 최신 데이터의 파괴를 막는다. 파싱 불가 raw document도 사용자 export/복구용 백업을 남긴 뒤에만
기본 상태로 복구한다.

또한 v3 매니페스트는 내보내기만 해서는 기능이 아니다. 승인본 경로를
`assets/manifests/asset_manifest.json`으로 고정하고, app repository가 build-time import한 값을
`runtimeAssetManifest.ts`/`parseAssetManifest`에 통과시킨 뒤 인게임 슬롯에 공급한다. `content-io`는 UI 모듈을 읽을
수 없으므로 loader를 그 계층에 두지 않는다. 이 JSON은 `content/**/*.json` 개수에는 포함되지 않지만 T-2와
`schemas/asset-manifest.schema.json`의 byte-synced schema export/build gate에서 별도로 필수 검증한다.

### 1.4 S-4 · 비전투 이벤트 3종 스키마

기존 A/B/C와 동일하게 `NonCombatBaseShape`를 펼쳐 쓰고 `pattern` 리터럴로 판별한다.

```ts
// src/engine/domain/schemas/runEvent.ts

/** Run events can spend only resources that actually live in RunState. */
const RunResourceAmountSchema = z.number().finite().nonnegative();

export const RunEventCostSchema = z
  .strictObject({
    stress: RunResourceAmountSchema.optional(),
    dp: RunResourceAmountSchema.optional(),
    trust: RunResourceAmountSchema.optional(),
  })
  .refine((cost) => Object.values(cost).some((value) => value !== undefined && value > 0), {
    message: 'a run-event cost must spend at least one positive resource amount',
  });

// src/engine/domain/schemas/primitives.ts — FlagStore와 모든 저작/세이브가 공유
export const FlagValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string(),
]);
const NonZeroRunResourceDeltaSchema = z.number().finite().refine((value) => value !== 0, {
  message: 'resource adjustment delta must be non-zero',
});

/** One effect changes one target. Multiple targets are authored as multiple effects. */
export const RunEffectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('GRANT_EVIDENCE'),
    target: ContentIdSchema,
  }),
  z.strictObject({
    type: z.literal('ADJUST_RESOURCE'),
    resource: z.enum(['stress', 'dp', 'trust']),
    delta: NonZeroRunResourceDeltaSchema,
  }),
  z.strictObject({
    type: z.literal('UPGRADE_EVIDENCE'),
    target: ContentIdSchema,
    /** Explicit destination; semantic validation requires to === nextAuthoredGrade(current). */
    to: GradeSchema,
  }),
  z.strictObject({
    type: z.literal('OPEN_ROUTE'),
    target: ContentIdSchema,
  }),
  z.strictObject({
    type: z.literal('SET_FLAG'),
    target: ContentIdSchema,
    value: FlagValueSchema,
  }),
]);

// runEvent.ts는 case/cutscene을 import하지 않는다.
// cutscene.ts는 RunEffectSchema만, case.ts는 RunEvent*와 CutsceneSchema를 import한다.

// src/engine/domain/schemas/case.ts
const MAX_ABS_CARD_TUNING = 10_000;
const CardTuningDeltaSchema = z.number().finite()
  .min(-MAX_ABS_CARD_TUNING).max(MAX_ABS_CARD_TUNING);
const CardCpTuningDeltaSchema = CardTuningDeltaSchema.int().safe();

/** D — 카드 강화: 보유 카드 1장을 골라 성능을 영구 튜닝한다. */
export const EnhanceCardEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('D'),
  /** Required soft-lock fallback when no owned card is eligible. */
  fallback_gains: z.array(RunEffectSchema).min(1),
  /** Offered tuning options; the player picks exactly one. */
  options: z
    .array(
      z.strictObject({
        option_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        /** Higher values win only in deterministic BEST autoplay; never changes gameplay/UI order. */
        autoplay_priority: NonNegativeIntegerSchema.max(10_000).default(0),
        costs: RunEventCostSchema.optional(),
        /** Restricts which owned card definitions this option may target. Empty = any. */
        eligible_intents: z.array(ActionIntentSchema).default([]),
        tuning: z.strictObject({
          cp_delta: CardCpTuningDeltaSchema.optional(),
          composure_damage_delta: CardTuningDeltaSchema.optional(),
          coercion_delta: CardTuningDeltaSchema.optional(),
        }).refine((t) => Object.values(t).some((value) => value !== undefined && value !== 0), {
          message: 'a tuning must change at least one stat',
        }),
        /** Optional narrative/resource payoff committed after the tuning. */
        effects: z.array(RunEffectSchema).default([]),
      }),
    )
    .min(2),
});

/** E — 탐문: 주변 인물에게 물어 진술 힌트/증거 단서를 연다. */
export const CanvassEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('E'),
  attempt_limit: z.number().int().positive(),
  per_attempt_costs: RunEventCostSchema,
  topics: z
    .array(
      z.strictObject({
        topic_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        /** Shown after the topic is canvassed; this is the payoff text. */
        reveal_key: LocalizationKeySchema,
        effects: z.array(RunEffectSchema).min(1),
      }),
    )
    .min(2),
});

/** F — 증거 수집/감식: 현장을 훑어 신규 증거를 파우치에 넣는다. */
export const CollectEvidenceEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('F'),
  attempt_limit: z.number().int().positive(),
  per_attempt_costs: RunEventCostSchema,
  targets: z
    .array(
      z.strictObject({
        target_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        evidence_id: ContentIdSchema,
        /** Forensic grade granted on collection. */
        grade: z.enum(['A', 'B', 'C']),
        effects: z.array(RunEffectSchema).default([]),
      }),
    )
    .min(2),
});

export const NonCombatEventSchema = z.discriminatedUnion('pattern', [
  ChoiceEventSchema,
  PlacementEventSchema,
  InvestigationEventSchema,
  EnhanceCardEventSchema,   // D
  CanvassEventSchema,       // E
  CollectEvidenceEventSchema, // F
]);
```

이 분리는 순환 회피 규범이다. `runEvent.ts → primitives/vocabulary`, `cutscene.ts → runEvent.ts`,
`case.ts → runEvent.ts + cutscene.ts`만 허용한다. `RunEffectSchema`가 들어간 컷씬을 정의하려고 `runEvent.ts`가
`case.ts`를 다시 import하거나 `case.ts ↔ cutscene.ts` 순환을 만드는 구현은 아키텍처 게이트에서 거부한다.

#### 1.4.1 flag hook selector와 canonical F-12 보존

기존 hook의 singular `choice`는 **pattern A의 authored `choice_id` 전용**으로 유지한다. D는 정확히 한 option을 고르지만
E/F와 컷씬에는 여러 selection이 생길 수 있으므로 `choice`를 재사용하지 않고 D 전용 `selection` selector를 추가한다.

```ts
export const FlagSetHookSchema = z.strictObject({
  encounter: ContentIdSchema.optional(),
  event: ContentIdSchema.optional(),
  choice: ContentIdSchema.optional(),      // pattern A only
  selection: ContentIdSchema.optional(),   // pattern D TUNE option_id only
  outcome: NonEmptyStringSchema.optional(),
  condition: ConditionSchema.optional(),
  value: FlagValueSchema.optional(),
}).refine((hook) =>
  hook.encounter !== undefined || hook.event !== undefined ||
  hook.choice !== undefined || hook.selection !== undefined || hook.condition !== undefined,
  { message: 'set_by must identify an encounter, event, A choice, D selection, or condition' },
);

interface FlagSetContext {
  readonly encounter?: string;
  readonly event?: string;
  readonly choice?: string;
  readonly selection?: string;
  readonly outcome?: string;
  readonly evaluateCondition?: FlagConditionEvaluator;
}
```

`FlagDefinitionSchema.default_value`, `FlagSetHookSchema.value`, `RunEffectSchema.SET_FLAG.value`, saved run의 flags record와
runtime `FlagStore`는 모두 이 **동일 `FlagValueSchema`**를 사용한다. `z.json()`으로 object/array/null을 허용한 뒤
runtime에서 throw하는 이중 계약을 남기지 않는다. 기존 primitive flag 콘텐츠의 렌더/세이브는 바뀌지 않으며 malformed
composite value는 content/save parse에서 먼저 거부한다.

`completeEventNode`는 hook을 마지막에 한 번 호출하며 A면 `choice`, D의 `TUNE`이면 `selection`만 전달한다.
`DECLINE`/`FALLBACK`, C/E/F의 다중 항목, BEFORE/AFTER 컷씬 choice는 이 selector에 넣지 않는다. E/F/컷씬의 flag 변화는
ordered `RunEffectSchema.SET_FLAG`로 draft에 기록한다. matcher는 `selection`도 기존 selector들과 같은 exact-match로 처리한다.

canonical 위치 14의 `event_ep004_ticket_trade`를 A→D로 바꿀 때 F-12를 잃지 않도록 다음 migration을 **원자적으로** 한다.

| 현행 | target |
|---|---|
| `choice_ep004_buy_vip_ticket` | D `option_id: option_ep004_buy_vip_ticket`, `autoplay_priority:0`; 기존 VIP 증거 grant를 option `effects`로 이동 |
| `choice_ep004_question_broker` | D `option_id: option_ep004_question_broker`, `autoplay_priority:100`; 기존 계약 증거 grant를 option `effects`로 이동 |
| `sets_flags.F-12` + hook `choice` | `sets_flags` 제거; common `flags.json`과 ep004 case-local hook 모두 `{event:'event_ep004_ticket_trade', selection:'option_ep004_question_broker', value:true}` |

두 D option에는 유효한 tuning과 기존 서로 다른 `costs`를 저작한다. buy/DECLINE/FALLBACK은 F-12를 true로 만들지 않고,
question selection만 hook에서 true가 된다. bundle validator는 global/case-local F-12 selector가 같은 의미인지, D option과
evidence ID가 실제 존재하는지, 제거된 두 `choice_*` ID가 flag/content 참조에 고아로 남지 않았는지 검사한다.
canonical D는 `autoplay_priority` 최댓값이 유일해야 하고 그 option에 canonical BEST 상태에서 지불 가능하며 non-noop인
eligible card가 최소 하나 있어야 한다. 이로써 dev policy가 삭제될 `choice_ep004_question_broker`를 하드코딩하지 않고도
`option_ep004_question_broker`를 선택해 F-12를 보존한다.

스키마 파싱 뒤 콘텐츠 의미 검증에서 다음도 강제한다.

- 모든 `option_id/target_id/choice_id/beat_id`는 자기 컬렉션에서 유일하다. `canvassedTopicIds`가 런 전역
  영속 키이므로 `topic_id`는 **canonical 15-node가 참조하는 모든 E 이벤트를 합친 catalogue에서도 유일**해야 한다.
  이 제약을 원하지 않으면 저장 키를 `{eventId, topicId}` 복합키로 바꾸며, 두 방식을 섞지 않는다.
- `attempt_limit <= topics.length/targets.length`; 이미 런에서 소진된 항목 때문에 가용 수가 0이면 비용 없이 종료한다.
- D의 eligible pair는 단순 `eligible_intents` 일치가 아니다. 현재 누적 tuning을 합성한 `EffectiveCardDefinition(before)`와
  해당 option을 finite checked-add한 `after`가 gameplay 구조상 달라지는 owned card만 허용한다. 예를 들어 CP가 이미 0인 카드의
  유일한 `cp_delta:-1`은 no-op pair라 UI/오토플레이 대상에서 제외한다. pair가 0개면 FALLBACK이며 no-op에 비용을 내지 않는다.
- F의 `evidence_id`는 현재 케이스 증거를 가리키며 중복되지 않는다. `grade`는 저장될 실제 등급이며
  해당 증거의 authored initial/upgrade 경로로 도달 가능해야 한다.
- E의 `OPEN_ROUTE.target`은 실제 질문 경로, `SET_FLAG.target`은 실제 플래그를 가리킨다.
- 모든 비용은 `stress/dp/trust`만 허용한다. 런에 존재하지 않는 `cp/coercion` 비용은 콘텐츠 검증에서 거부한다.
  기존 A의 `choices.costs`, C의 `per_attempt_costs`도 같은 `RunEventCostSchema`로 교체해 현재의 silent ignore를 없앤다.

**런 자원 postcondition**도 타입 shape와 별도로 강제한다. app은 balance에서
`RunResourceBounds { stressMax: balance.stress.max, trustMax: balance.trust.max }`를 순수 event reducer에 주입한다.
모든 cost/effect prefix는 연산 직후 `Number.isFinite`를 확인하고, stress는 `0 < stress <= stressMax`, trust는
`0 <= trust <= trustMax`, dp는 유한한 `0 <= dp`여야 한다. 기존 balance/Cost/Effect schema가 유한 소수를 허용하므로
run reducer도 safe integer를 추가로 요구하지 않는다. 양의 stress/trust effect는 max에서 clamp하고,
dp/trust의 음수 effect는 0에서 clamp하되, cost 부족은 clamp하지 않고 거부한다. **stress를 0으로 만드는 cost/effect는
비전투 이벤트에서 패배로 커밋하지 않고 선택 불가로 처리한다.** 그렇지 않으면 다음 encounter가 0-stress boundary를
반복 RETRY하는 복구 불가 루프가 된다. EVENT에서도 패배를 허용하려면 별도 terminal/dead-scene 제품 설계가 필요하다.

liveness를 위해 pattern A는 최소 한 개의 stress 비소모·항상 지불 가능한 **total-effect** 이탈 choice를 콘텐츠 gate가
요구하고, C/E/F는 빈 selection의 명시적 종료를 유지한다. D는 아래의 cost-free `DECLINE`을 항상 허용하며, pair 0에서
오토플레이가 고르는 `fallback_gains`도 같은 total-effect gate를 통과해야 한다. skippable cutscene의 default path에도
음의 stress effect와 현재 소유/등급에 따라 실패하는 `UPGRADE_EVIDENCE`를 금지해 어떤 합법 reachable run boundary에서도
진행이 막히지 않게 한다. `GRANT_EVIDENCE`/`OPEN_ROUTE`는 append-unique, `SET_FLAG`는 overwrite, 상한·하한이 있는
resource effect는 clamp 의미가 전제다. 이후 부분적 RunEffect가 추가되면 A 이탈/D fallback/skippable default-path의 공용
allowlist도 함께 갱신하며, 단순히 schema target이 존재한다는 이유로 total effect로 간주하지 않는다.

`DECLINE`은 authored option이 아니라 모든 D 화면이 app에서 주입하는 로컬라이즈된 “지나간다” action이다. 비용·tuning·
effect가 없고 항상 활성이다. `FALLBACK`은 eligible `(option, owned card)` 쌍이 0개일 때만 자동/명시 완료하며
semantic gate를 통과한 total `fallback_gains`를 적용한다. eligible 대상이 있어도 플레이어가 나갈 수 있는 경로가
`DECLINE`이고, 두 의미를 합치지 않는다.

> **왜 A/B/C를 확장하지 않고 D/E/F를 신설하는가**
> `NonCombatEventSchema`는 `discriminatedUnion('pattern', …)`이다. 기존 패턴에 옵셔널 필드를 얹으면
> `applyEventDefinition`의 분기가 런타임 `undefined` 검사로 오염되고, 화면도 "어떤 모드인지"를 필드 유무로
> 추론해야 한다. 판별자를 늘리면 **타입 수준에서 전수 검사가 강제**되고
> `createEventScreen`의 `switch`가 exhaustive해진다.

### 1.5 S-7 · RunState 확장

```ts
export interface CardTuning {
  readonly cpDelta: number;
  readonly composureDamageDelta: number;
  readonly coercionDelta: number;
}

export interface RunState {
  // …기존 필드…
  /** Permanent per-card-definition tuning acquired from pattern D events. */
  readonly cardTuning: Readonly<Record<string, CardTuning>>;
  /** Topics already canvassed this run; pattern E must not re-offer them. */
  readonly canvassedTopicIds: readonly string[];
  /** Acquired evidence grade; acquiredEvidenceIds alone cannot represent F/UPGRADE_EVIDENCE. */
  readonly evidenceGradeById: Readonly<Record<string, 'A' | 'B' | 'C'>>;
  /** Routes earned by events and injected into the next compatible encounter. */
  readonly openRouteIds: readonly string[];
}
```

**`cardTuning` 소비 지점** — `createEncounterSession`이 `cards.json`을 코디네이터에 넘길 때
`cost.cp = max(0, (card.cost.cp ?? 0) + tuning.cpDelta)`로 만들고, 평정/강압 델타는 명시된 부호 규칙에 따라
카드 `modifiers`의 `ADJUST_RESOURCE` 효과로 컴파일해 **주입 시점에 1회 합성**한다.
세 필드는 모두 **signed additive**로 확정한다. `cp_delta`는 원가에 그대로 더하고 0에서 clamp한다.
`composure_damage_delta`는 피해량에 더하므로 resource effect에는 부호를 뒤집어
`ADJUST_RESOURCE(composure, -composure_damage_delta)`로 컴파일한다. `coercion_delta`는 coercion resource delta에
그대로 더한다. 따라서 음수 composure-damage는 피해 완화/회복, 음수 coercion은 강압 감소다. 옵션 하나의 세 값이
전부 0인 경우는 스키마가 거부하고, UI summary도 이 동일한 signed 값에서 만든다.
합성된 동일 카탈로그를 코디네이터뿐 아니라 UI의 카드 비용·설명·playability 계산에도 공급한다.
원본 `loadedCards`를 UI가 계속 읽으면 표시 비용과 실제 차감 비용이 달라진다.
엔진(`EncounterCoordinator`)은 튜닝의 존재를 알지 못한다 — 이미 튜닝된 카드 정의를 받을 뿐이다.
이로써 §0.2-4(상태 변경 지점 2곳) 불변식이 유지된다.

**resource modifier 합성 순서**도 canonical로 고정한다. 현 coordinator는 modifier 배열 순서대로 매 effect를 즉시 clamp하므로
base `-4`와 tuning `+5`를 따로 append하면 coercion=0에서 순서에 따라 5 또는 1이 된다. `EffectiveCardDefinition`
compiler는 각 resource별 authored `ADJUST_RESOURCE` delta와 tuning contribution을 finite checked-add로 먼저 합산하고, resource당
**한 개의 normalized effect**로 만들어 coordinator가 한 번만 clamp하게 한다. 기존 배열에서 해당 resource effect가 처음
나온 위치에 normalized effect를 두고 나머지 동일-resource effect는 제거하며, 다른 effect의 상대 순서는 유지한다.
합계 0은 effect를 생략한다. UI summary/playability와 실제 제출은 이 동일 effective definition을 사용하고 0/max 경계,
양·음 혼합, 누적 overflow 거부를 회귀로 고정한다.

정적 한국어 description에서 숫자를 regex 치환하지 않는다. app presentation이 같은 `EffectiveCardDefinition`에서
`cpCost`와 구조화 `CardTuningView { requested, realized }`를 만든다. `requested`는 option/raw 누적 delta,
`realized`는 clamp/normalization 뒤 before→after 실제 차이다. 카드 UI는 catalogue의 `event.enhance.summary.*` 포맷으로
“강화: CP -1 · 평정 피해 +2” 같은 **realized** badge/suffix를 렌더하고, 디버그 상세에서만 requested를 구분한다. 화면 숫자,
playability, 실제 effect를 하나의 effective definition으로 비교하는 회귀를 둔다.

현재 덱은 물리 인스턴스 ID가 아니라 카드 ID 문자열의 중복 배열이다. 따라서 D는 “복사본 1장”이 아니라
**선택한 카드 정의의 모든 복사본**을 강화한다. 복사본 한 장만 강화하려면 덱·보상·세이브 전체에 고유
instance ID를 먼저 도입해야 하므로 이 설계의 범위가 아니다. 이후 보상으로 같은 `card_id` 복사본을 더 얻어도
동일 definition tuning을 자동 상속한다는 점을 UI 도움말과 회귀 테스트에 명시한다.

세이브 복원 의미 검증 카탈로그에 `cardIds/evidenceIds/routeIds/topicIds`를 추가한다.
`cardTuning`의 키는 known card, `evidenceGradeById`의 키는 `acquiredEvidenceIds`의 부분집합이면서 known evidence,
`openRouteIds`는 known route, `canvassedTopicIds`는 known topic이어야 한다. `createEncounterSession`은
active case catalogue와 교집합인 `evidenceGradeById`를 주입한다. route는 case ID 일치만으로 주입하지 않고,
`route.target_slot`이 해당 encounter의 `rounds.statement_claims`, flow node `reveal_claim_ids/revise_claim_ids`, objective
`claim_id` 합집합에 속하는 **encounter-compatible route**만 주입한다. 다른 encounter/case용 run 항목은 버리지 않는다.
UI와 엔진은 같은 합성 상태를 읽는다.
`EncounterRunProjection`과 `encounterRunProjection()`도 evidence grade를 왕복시켜 전투 중 업그레이드가 다음
node boundary에 보존되게 한다. 소유 ID만 projection하면 화면에서는 A등급이었는데 저장 후 초기 C등급으로
되돌아간다.

#### 1.5.1 save v2 직렬화/마이그레이션 계약

`SavedRunStateSchema`에는 `card_tuning`, `canvassed_topic_ids`, `evidence_grade_by_id`, `open_route_ids`를 추가하고,
`SaveDataV2Schema` envelope에는 save-only `run_contract_fingerprint: string | null`을 추가한다. 지문은 `RunState`
필드가 아니며 app save metadata가 소유한다.
`toRunSaveData`는 리터럴 `save_version:1`을 남기지 말고 `CURRENT_SAVE_VERSION`을 사용한다.

```ts
const SavedCardTuningSchema = z.strictObject({
  cp_delta: z.number().int().safe().min(-10_000).max(10_000),
  composure_damage_delta: z.number().finite().min(-10_000).max(10_000),
  coercion_delta: z.number().finite().min(-10_000).max(10_000),
});

const SavedRunStateV2Fields = {
  card_tuning: z.record(ContentIdSchema, SavedCardTuningSchema),
  canvassed_topic_ids: uniqueContentIds(),
  evidence_grade_by_id: z.record(ContentIdSchema, GradeSchema),
  open_route_ids: uniqueContentIds(),
} as const;

// SaveDataV2 envelope/app metadata; RunState에는 들어가지 않는다.
run_contract_fingerprint: NonEmptyStringSchema.nullable();

// src/app/save/runContractFingerprint.ts — code-owned persisted-run semantics sentinel.
export const RUN_RULES_CONTRACT_VERSION = 1 as const;

// No default: the production wrapper must visibly pass the owned constant, while tests can pass N+1.
export function buildRunContractProjection(
  source: RunContractProjectionSource,
  rulesContractVersion: number,
): RunContractProjection;

export function buildCurrentRunContractFingerprint(source: RunContractProjectionSource): string {
  return fingerprint(buildRunContractProjection(source, RUN_RULES_CONTRACT_VERSION));
}
```

restore는 snake_case를 `CardTuning`의 camelCase로 정확히 투영하고 `toRunSaveData`는 반대 변환을 한다. 배열 중복,
unknown ID, tuning 범위/누적 overflow는 parse/semantic 단계에서 상태 변경 전에 거부한다. 기본값을 여러 계층에서
따로 채우지 않고 v1→v2 migrator가 한 번 canonical 값을 만든 뒤 V2 schema로 재파싱한다.
복원 semantic 검증도 현재 balance의 `RunResourceBounds`를 적용해 stress/trust/dp finite/range postcondition과
자원 범위를 확인한다. **nonterminal run은 stress>0**이어야 한다. 단, `terminal:true`이고 마지막 outcome이 현 노드의
`FAILED`인 합법 terminal save는 `stress>=0`을 허용한다. 현 save는 `OutcomeReason`을 보존하지 않으므로 복원기가
stress=0에서 사유를 재구성하거나 특정 reason을 주장하지 않는다. 특히 depleted failure의 stress=0 terminal round-trip을
거부하면 안 된다. invalid save를 clamp/치유해 다른 상태로
재개하지 않고 원본 보존 오류로 돌린다.

- 신규 save의 지문은 `SHA-256(stableCanonicalJson(contractProjection))`이다. projection에는 code-owned
  `RUN_RULES_CONTRACT_VERSION`(event reducer 순서, resource clamp, route 소비처럼 shape가 같아도 의미가 바뀌는 규칙),
  `run-strip.schema_version`, ordered `node_id/kind/ref/case_directory`, 참조 case의 `content_version`과 gameplay 정의,
  그리고 **ID가 같아도 수치 변경이 런 의미를 바꾸는 공용 catalogue** `cards/balance/flags/rewards/relics/enhancements/grades`
  의 schema version + 검증된 gameplay body를 넣는다. localization 문구·asset URL과 D의 `autoplay_priority`처럼
  플레이어 입력 이후의 상태 전이 의미에 영향 없는 presentation/QA metadata는 projection에서 명시적으로 제거한다.
  저장·복원 양쪽이 같은 순수 builder를 사용하며 `assertRestoredRunSaveSemantics`가 현재 지문과 byte-equal인지 검사한다.
  이 projection의 어느 값이 바뀌어도 지문이 바뀌며, case/common 콘텐츠 배포 절차는 대응 version bump도 요구한다.
- `RUN_RULES_CONTRACT_VERSION`의 단일 소유 파일은 `src/app/save/runContractFingerprint.ts`다. event draft/reducer의
  eligibility·cost/effect 순서, resource clamp/bounds/death threshold, `nextAuthoredGrade`, route 주입·소비,
  reward/deck/RNG 전이처럼 **같은 검증 콘텐츠와 save shape에서 다음 RunState가 달라지는 코드 규칙**을 바꾸는 changeset은
  이 값을 올린다. UI layout/문구/asset/QA-only `autoplay_priority` 변경은 올리지 않는다. 해당 규칙 파일을 수정한 PR
  체크리스트에는 `규칙 버전 bump: yes/no + 근거`를 필수로 남기고, yes이면 fingerprint fixture와 migration 호환 판단을
  함께 갱신한다. `CURRENT_SAVE_VERSION`은 직렬화 shape 버전이고 이 상수는 전이 의미 버전이므로 서로 대체하지 않는다.
  production save/restore는 반드시 `buildCurrentRunContractFingerprint()`를 사용한다. 버전 인자를 생략하는 overload나
  caller 임의 버전을 허용하는 production 경로를 두지 않는다.
- v1에 `run`이 있으면 네 필드를 `{}`, `[]`, `{}`, `[]`로 채우되 지문은 **추측하지 않고 `null`**로 둔다. 노드 ID를
  유지한 채 A~F 정의가 교체될 수 있으므로 진행된 v1 save를 현재 catalogue와 같다고 간주하면 신규 비용/튜닝/증거/
  route 효과가 빠진 상태를 합법화한다.
- `run_contract_fingerprint:null`인 legacy save는 현재 seed/config의 `createInitialRunState()`를
  `toRunSaveData()`로 투영한 **전체 canonical node-boundary gameplay envelope**와 deep-equal일 때만 resume한다.
  비교에는 `claims/evidence`, 네 deck pile과 `locked_cards`, flags, `resources`의 일곱 필드, `encounter:null`,
  `used_routes`, relic/enhancement, 그리고 run의 node/history/reward/evidence/event/terminal 필드를 전부 넣는다.
  restore가 무시하는 legacy 필드를 비교에서 빼거나 조용히 버려 pristine으로 치유하지 않는다. `$schema`,
  `save_version`, `run_contract_fingerprint`만 비교 밖 metadata이고, `run_seed/case_id/content_version`은 현재 boundary 계약과 별도로 정확히
  일치해야 한다. 그 외에는 명시적 `StaleRunContractError`로 거부한다. bootstrap은 이 오류를 일반 복원 실패 catch의
  `saveRepository.clear()`로 보내지 않고 원본 raw bytes를 유지한 채 `[원본 내보내기]`/`[새 런 시작]`을 제시하며,
  사용자가 두 번째 액션을 확정했을 때만 clear한다. 다음 node-boundary save부터 현재 지문이 기록된다.
- v1에 `run`이 없는 legacy 문서는 현재처럼 import 파싱은 가능하게 유지할 수 있지만,
  `assertRestoredRunSaveSemantics`가 resumable boundary가 아니라고 거부한다. 빈 런 상태를 임의로 만들어 진행을 위조하지 않는다.
- 미래 버전은 `UnsupportedSaveVersionError`로 거부한다.
- migration은 입력을 변경하지 않고 새 객체를 반환하며, v1→v2→parse 순서를 단위 테스트한다.
- `open_route_ids`는 canonical strip에서 이벤트 뒤의 다음 **encounter-compatible encounter** 시작에만 주입한다.
  단순 active-case route ID 교집합이 아니라 위 target-claim predicate까지 통과한 ID를 `injectedOpenRouteIds`로 따로
  캡처하고, 그 encounter의 비실패 완료가 저장된 뒤 그 ID만 제거한다. 다른 encounter/case용
  route를 전부 지우지 않는다. 저장 실패/FAILED/RETRY면 이전 save/state에 그대로 남아 재시도에서 다시 주입된다.
- semantic validator는 각 event `OPEN_ROUTE`가 canonical strip 뒤쪽의 어떤 encounter catalogue에서 소비 가능한지,
  run 종료까지 영원히 orphan으로 남지 않는지 검증한다.

### 1.6 S-5 · 컷씬 스키마

```ts
// src/engine/domain/schemas/cutscene.ts (신규)
export const CutsceneBeatSchema = z.strictObject({
  beat_id: ContentIdSchema,
  /** Background swap; omit to keep the previous beat's background. */
  background_asset_key: z.string().trim().min(1).optional(),
  /** Up to two speakers, left and right. */
  portraits: z.array(z.strictObject({
    side: z.enum(['LEFT', 'RIGHT']),
    asset_key: z.string().trim().min(1),
    dim: z.boolean().default(false),
  })).max(2).default([]),
  speaker_name_key: LocalizationKeySchema.optional(),
  text_key: LocalizationKeySchema,
  /** Declarative camera/transition treatment; renderers never branch on ids. */
  treatment: z.enum(['NONE', 'FADE_IN', 'FADE_OUT', 'SHAKE', 'FLASH', 'SLOW_FADE']).default('NONE'),
  audio_cue: z.string().trim().min(1).optional(),
  duration_ms: z.number().int().positive().max(20_000).default(2_400),
  /** Branch point. When present the beat waits for input instead of auto-advancing. */
  choices: z.array(z.strictObject({
    choice_id: ContentIdSchema,
    label_key: LocalizationKeySchema,
    /** Beat to jump to; omit to fall through to the next beat. */
    goto_beat_id: ContentIdSchema.optional(),
    gains: z.array(RunEffectSchema).default([]),
  })).max(4).default([]),
  /** Required on a choice beat when the containing cutscene is skippable. */
  default_choice_id: ContentIdSchema.optional(),
});

export const CutsceneSchema = z.strictObject({
  cutscene_id: ContentIdSchema,
  /** Where this cutscene plays relative to its host node. */
  timing: z.enum(['BEFORE', 'AFTER']).default('BEFORE'),
  skippable: z.boolean().default(true),
  beats: z.array(CutsceneBeatSchema).min(1).max(64),
});
export type CutsceneDefinition = z.infer<typeof CutsceneSchema>;

export const EventCutscenesSchema = z.array(CutsceneSchema).max(2).superRefine((items, context) => {
  const ids = new Set<string>();
  const timings = new Set<'BEFORE' | 'AFTER'>();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.cutscene_id)) {
      context.addIssue({ code: 'custom', path: [index, 'cutscene_id'], message: 'duplicate cutscene id' });
    }
    if (timings.has(item.timing)) {
      context.addIssue({ code: 'custom', path: [index, 'timing'], message: 'duplicate cutscene timing' });
    }
    ids.add(item.cutscene_id);
    timings.add(item.timing);
  }
}).default([]);
```

target에도 A로 남는 이벤트의 `choices.sets_flags`는 checked-in 콘텐츠에서 `gains: [{ type:'SET_FLAG', ... }]`로
옮기고 strict schema에서는 제거한다. 컷씬 선택 역시 `gains`의 `SET_FLAG`만 사용한다. 단, A→D로 바뀌는 canonical
F-12는 §1.4.1의 D `selection` hook이 기존 global/case-local 선언을 보존하며 option effect에 SET_FLAG를 중복 저작하지
않는다. 별도 map과 효과 배열이 같은 flag를 서로 덮어쓰는 이중 경로를 남기지 않는다.

Zod 모양 검증만으로는 분기 그래프가 안전하지 않다. 콘텐츠 검증기는 비트/선택 ID 유일성, 좌·우 portrait
중복 금지, 모든 `goto_beat_id/default_choice_id` 존재와 소속 choice 일치, 시작 비트에서의 도달 가능성,
순환 부재, 모든 경로의 종료 가능성을 검사한다. `skippable:true`의 choice beat는 `default_choice_id`가 필수이며
skip은 그 기본 경로를 따라가되 상태 효과는 이벤트 draft에 정확히 한 번만 staging한다. semantic gate는 전체 default
경로의 effect를 위 total-effect allowlist로 전수 검사하고 `UPGRADE_EVIDENCE`/음의 stress/향후 미분류 effect를 거부한다.

app projection은 `default_choice_id`를 검증된 `CutsceneBeatView.defaultChoiceId`로 넘긴다. `skip()`은 현재 beat부터
`resolveNext(beatId, defaultChoiceId)`를 **부작용 없이 끝까지** 순회해 immutable selection batch를 먼저 만든다.
기본값 누락·끊긴 경로·cycle·unknown beat가 하나라도 있으면 callback과 draft를 전혀 건드리지 않고 오류 경계로 보낸다.
검증된 batch는 `onSkipChoices(selections)` 한 번으로 staging하고 성공한 뒤에만 `playbackState='COMPLETE'`가 된다.
app callback도 새 draft를 로컬 변수에서 완성·검증한 뒤 한 번 교체하므로 두 번째 choice에서 예외가 나도 첫 choice만
남지 않는다. 이미 지나온 beat는 batch에 넣지 않고 각 `(beatId,choiceId)`는 정확히 한 번만 포함한다. overlay가
default path/effect를 모른 채 화면만 닫거나 skip을 `onChoice` 여러 번으로 부분 적용하는 구현은 금지한다.

i18n 키는 strings coverage, asset key는 3구간 registry와 실제 PNG, audio cue는 `SoundId`와 실제 OGG,
flag/effect target은 semantic catalogue로 전수 검증한다. 선택 효과는 범용 `EffectSchema`가 아니라
S-10 `RunEffectSchema`만 허용한다.

단, `engine/domain`이나 `content-io`가 `src/audio`/`src/ui` registry를 import해서 이 교차 검증을 수행하면 아키텍처
게이트를 위반한다. `CutsceneSchema.audio_cue/asset_key`는 domain에서 non-empty string으로 유지하고, graph·flag·route·
evidence 검증은 `ContentSemanticValidator`가 담당한다. 실제 `SoundId`/OGG, asset key/PNG, strings catalogue의 교집합은
`tools/validate` 진입점 또는 테스트 조립 계층이 각 catalogue를 주입해 검증한다. 런타임 app loader도 같은 검증된
catalogue를 사용하며 unknown cue/key를 UI에서 조용히 무시하지 않는다.
현 `strings-coverage.test.ts#LOCALIZATION_KEY_FIELDS`에는 `text_key/speaker_name_key/reveal_key`가 없으므로
목록을 확장한다. 코드 테이블에 있는 `dead.*` 키는 JSON 재귀 수집 대상이 아니므로 dead-scene table 전수 테스트가
strings catalogue 존재까지 확인한다.

`CutsceneSchema.treatment`의 engine 타입을 UI가 import하지 않는다. UI에는 동일 문자열 어휘의
`PresentationTreatment`를 `src/ui/core/presentationTreatment.ts`에 별도로 두고, app projection이 engine 값을
exhaustive switch로 변환한다. 두 catalogue의 집합 일치 테스트를 두어 복제가 drift하지 않게 한다.

---

## 2. Section 2 — Asset Resizing & 1280×321 Desk Layout

### 2.1 임의 스케일링의 3개 소비자

| 소비자 | 변경 |
|---|---|
| **워크벤치 편집기** (`workbench/main.mts`, `image-slot.mts`) | 슬롯 인스펙터에 `W`/`H` 수치 입력 2칸 + `비율 유지` 체크박스 추가. 체크 해제 시에만 두 칸이 독립 편집 가능 |
| **워크벤치 렌더러** (`workbench/model.mts`) | 드래그 `scale` 모드가 `preserveAspectRatio`를 존중 — 켜져 있으면 코너 드래그가 종횡비를 고정, 꺼져 있으면 자유 변형 |
| **인게임 렌더러** (`src/ui/core/assetResolver.ts` 경유 각 화면) | `applyTransformToSprite(sprite, transform, dimensionId)` 단일 헬퍼로 통일. 현재 각 화면이 `sprite.width = …` 를 직접 쓰는 곳을 이 헬퍼로 교체 |

현재 `assetResolver.ts`는 registry URL만 고르고 transform/manifest를 전혀 읽지 않는다. 신규 consumer 계약은 다음과 같다.

1. 승인된 v3 `assets/manifests/asset_manifest.json`을 저장소에 체크인하고 app에서 build-time import한다.
2. 부팅 시 `parseAssetManifest` + canonical slot/dimension 일치 검증을 통과하지 못하면 명확히 실패한다.
3. app이 `RuntimeAssetLayout` 포트로 필요한 slot transform을 UI에 주입한다. UI가 localStorage나 engine을 읽지 않는다.
4. 각 sprite는 URL resolve 후 transform을 **한 번만** 적용한다. `width/height` 직접 지정과 `scale` 적용을 중첩하지 않는다.
5. 워크벤치 localStorage는 미승인 저작 상태이므로 게임 런타임이 직접 소비하지 않는다.
6. portrait는 자매 문서 §4.3의 합성 규칙을 따른다. manifest의 `suspect-base`/`partner-base`는 전역 anchor만
   제공하고, 캐릭터 sidecar가 base/upset/lose/used의 로컬 transform/layer를 소유한다. state slot transform을
   sidecar 위에 다시 적용해 이중 이동·이중 스케일하지 않는다.

**좌표·회전 중심 계약**도 manifest/워크벤치/Pixi 런타임에서 하나로 고정한다. manifest의 `x/y`는 회전 전 logical
rect의 좌상단이고, `resolveTransformSize()`가 계산한 `width/height`와 함께 중심
`(x + width / 2, y + height / 2)`을 만든다. 워크벤치 stage element와 gizmo는 모두 이 중심을
`transform-origin`으로 사용한다. `applyTransformToSprite()`는 Pixi `Sprite`에 `anchor.set(0.5)`,
`position.set(centerX, centerY)`, resolved `width/height`, `rotation`을 같은 의미로 적용한다. Pixi 기본 좌상단 pivot에
`position.set(x, y)`한 뒤 회전하는 구현은 금지한다. 회전된 AABB는 가시성/clamp 진단에만 쓰고 manifest의
`x/y/width/height`로 역저장하지 않는다. portrait의 추가 로컬 합성은 이 전역 중심 rect 위에서 자매 문서 §4.3 행렬을
적용한다.

현 `SlotId/SLOT_IDS`가 `workbench/model.mts`에만 있으므로 production loader가 그것을 import하거나 같은 문자열을
복제해서는 안 된다. ID와 expected dimension/required 여부를 `src/ui/core/assetSlots.ts`로 추출하고, workbench의
label/defaultRect/downloadName은 그 공용 catalogue를 확장한다.

`RuntimeAssetLayout`은 임의 string map이 아니라 공용 `AssetSlotId`에 대한 `RUNTIME_SLOT_BINDINGS` exhaustive record로 만든다.
각 binding은 `slotId → 소비 screen/widget + expected dimension + required/optional + imageSource`를 선언한다.
`imageSource`는 다음 셋 중 하나다.

- `MANIFEST`: 책상처럼 승인 manifest의 canonical filename이 실제 art를 고른다. required인데 `image:null`이거나
  registry filename→3구간 key 역색인에 없으면 실패한다.
- `VIEW_MODEL`: 용의자/파트너/카드/증거처럼 현재 encounter/model/portrait sidecar가 art를 고르고 manifest는 transform만
  제공한다. workbench active character의 preview filename이 게임 캐릭터를 덮어쓰면 안 된다.
- `AUTHORING_ONLY`: 비교용 샘플 slot로 production sprite consumer가 없다. runtime layout에서 제외하되 manifest shape/
  dimension 검증은 유지한다.

16개 slot의 전략은 다음 표로 고정한다. `VIEW_MODEL`은 **art 선택만 동적**이고 표에서 “stage transform 사용”인 항목만
manifest transform을 소비한다. `AUTHORING_ONLY` sample transform을 production component에 적용해서는 안 된다.

| slot | imageSource | 승인 image / transform | production consumer / 좌표 권한 |
|---|---|---|---|
| `bg-room` | `MANIFEST` | image **required**, transform required | interrogation room background; manifest image+stage transform |
| `suspect-base` | `VIEW_MODEL` | manifest image ignored/optional, transform **required** | current suspect/sidecar가 art 선택; manifest는 유일한 global portrait anchor |
| `suspect-state-parts` | `AUTHORING_ONLY` | image optional, sample transform required only for workbench round-trip | upset preview sample; runtime은 suspect-base anchor × portrait sidecar local transform |
| `suspect-lose-parts` | `AUTHORING_ONLY` | image optional, sample transform required only for workbench round-trip | lose preview sample; 위와 동일 |
| `fg-desk` | `MANIFEST` | image **required**, transform required | desk image+stage transform; 아래 canonical rect constraint 필수 |
| `card-base` | `AUTHORING_ONLY` | image optional, sample transform only | fan/modal은 `CARD_LAYER_RECTS`와 동적 card layout이 권한 |
| `card-art-1` | `AUTHORING_ONLY` | image optional, sample transform only | intent art sample; 실제 art는 card view + card-local illust rect |
| `card-art-2` | `AUTHORING_ONLY` | image optional, sample transform only | 위와 동일 |
| `card-art-3` | `AUTHORING_ONLY` | image optional, sample transform only | 위와 동일 |
| `ev-1` | `VIEW_MODEL` | manifest image ignored/optional, transform **required** | evidence #1 art는 model, manifest stage rect는 tray slot #1에 사용 |
| `ev-2` | `VIEW_MODEL` | manifest image ignored/optional, transform **required** | evidence #2, tray slot #2 |
| `ev-3` | `VIEW_MODEL` | manifest image ignored/optional, transform **required** | evidence #3, tray slot #3 |
| `icon-composure` | `MANIFEST` | image **required**, transform required | HUD icon image+stage transform; gauge anchor도 resolved rect에서 파생 |
| `icon-coercion` | `MANIFEST` | image **required**, transform required | HUD icon image+stage transform; punish anchor도 resolved rect에서 파생 |
| `partner-base` | `VIEW_MODEL` | manifest image ignored/optional, transform **required** | 김_인턴/sidecar가 art 선택; manifest는 유일한 partner global anchor |
| `partner-used` | `AUTHORING_ONLY` | image optional, sample transform only | cooldown preview sample; runtime은 partner-base anchor × sidecar used local transform |

컷씬 background/left/right portrait는 이 catalogue에 속하지 않고 §3.1 fixed rect + registry URL을 사용한다. 카드 art sample,
state portrait sample, partner-used sample의 stage transform을 runtime에 흘리면 component-local/sidecar transform과 이중
적용되므로 T-2에서 runtime binding 부재를 단언한다.

승인 단계에서 unknown/duplicate slot과 dimension 불일치를 거부하고, UI에는 binding 정책을 거친 `assetKey/url`만 넘긴다.
프로덕션에서 실패한 required MANIFEST slot을 벡터 placeholder로 조용히 대체하지 않는다. optional slot만 명시적 fallback을
가진다.

워크벤치 편집 상태도 aspect/custom 값을 잃지 않아야 한다. 공통 document v4에서 storage의
`transforms: Record<SlotId, AssetTransform>`는 유지하고, 메모리 `WorkbenchState`에는 다음 sizing 메타데이터를
추가한다. geometry/rotation에서 다시 scale만 계산해 내보내면 custom/aspect 필드가 사라지는 현재 구조를 보완한다.

```ts
interface SlotSizingState {
  readonly customWidth?: number;
  readonly customHeight?: number;
  readonly preserveAspectRatio: boolean;
}
interface WorkbenchState {
  // existing geometry/rotation/locks/images/characters...
  readonly sizing: Readonly<Record<SlotId, SlotSizingState>>;
}
```

`buildSlotTransform`은 geometry/rotation/legacy scale과 sizing을 한 번에 합치고, v4 load는 transform을
geometry+sizing으로 분해한다. 자매 문서의 character 상태와 이 필드는 같은 v4 migration 결과에 함께 있어야 한다.

**편집 모드 전환 규칙**을 고정하지 않으면 custom 값이 scale을 가려 “숫자를 바꿨는데 화면이 안 변하는” 버그가 난다.

- inspector는 `W/H`, `Sx/Sy`, `비율 유지`를 모두 표시하되 현재 authoritative mode를 `CUSTOM`/`SCALE`로 표시한다.
- W 또는 H를 편집하면 `CUSTOM`이 된다. aspect lock ON이면 마지막으로 편집한 한 축만 저장하고 다른 축은 resolver가
  계산한다. lock OFF이면 두 축을 materialize한다.
- Sx/Sy를 편집하면 두 custom 필드를 지우고 `SCALE`이 되며 입력한 scale이 즉시 geometry를 결정한다.
- custom 상태에서 gizmo scale을 드래그하면 custom W/H를 갱신한다. scaleX/Y만 바꿔 visual이 그대로인 no-op을 금지한다.
- lock OFF→ON은 마지막 편집 축을 authoritative로 남기고 다른 custom 축을 제거한다. ON→OFF는 당시 resolved 두 축을
  materialize해 토글 순간 화면이 움직이지 않게 한다.
- reset과 v2/v3 migration은 기존 geometry가 pixel-identical하도록 mode/value를 만들며 undo/reload/export 뒤 mode도 보존한다.

**신규 순수 함수** — 세 소비자가 공유하며, 렌더러 없이 단위 테스트된다:

```ts
// src/ui/core/assetManifest.ts
export interface ResolvedSize { readonly width: number; readonly height: number }

export function resolveTransformSize(
  transform: AssetTransform,
  dimension: AssetDimensionId,
): ResolvedSize;

/**
 * Pixel-art safety: position is always snapped. Size obeys the aspect policy
 * below and returns diagnostics instead of silently distorting.
 */
export function snapTransformToRenderGrid(
  transform: AssetTransform,
  dimension: AssetDimensionId,
  renderScale = DEFAULT_TARGET_SCALE,
): ResolvedTransform & {
  readonly diagnostics: {
    readonly aspectExact: boolean;
    readonly sizeGridAligned: boolean;
    readonly strictPixelScale: boolean;
  };
};
```

### 2.2 픽셀 퍼펙트 보장 규칙

임의 크기·정확한 종횡비·모든 출력 크기의 정수 HD 픽셀·정수배 source sampling은 임의의 비율에서 동시에 보장할 수
없다. `NEAREST`는 보간 흐림을 막지만 비정수 배율의 uneven pixel cadence까지 없애지는 않는다. 따라서 다음 우선순위를
명시하고 진단을 노출한다.

1. **위치 스냅(항상)** — 최종 `x/y`는 `1/renderScale`(=0.5 logical) 격자에 맞춘다.
2. **비율 잠금 ON** — 마지막으로 편집한 W/H 한 축만 0.5 grid에 맞추고 반대 축은 source aspect로 정확히 계산한다.
   파생 축이 0.5 grid가 아니어도 종횡비를 깨려고 독립 반올림하지 않는다. `aspectExact=true`, 필요하면
   `sizeGridAligned=false` 경고를 표시한다.
3. **비율 잠금 OFF** — 의도적 자유 변형이므로 W/H 두 축을 각각 0.5 grid에 맞춘다. source aspect와 다르면
   `aspectExact=false` 경고를 표시한다.
4. **strict pixel scale 진단** — source→최종 HD 배율이 정수 확대 또는 정확한 `1/n` 축소인 경우에만
   `strictPixelScale=true`다. ±0.02 근접 시 워크벤치가 스냅을 *제안*할 수 있지만 사용자 확인 전 parser/runtime이
   값을 몰래 바꾸지 않는다.
5. **왜곡 경고** — `preserveAspectRatio:false`이고 종횡비 편차가 2%를 넘으면 inspector badge를 띄운다. required
   canonical slot(책상·초상·카드 base)은 승인 manifest 정책에서 aspect unlock을 거부하고, 자유 변형 허용 slot만
   opt-in한다.

legacy v2 required slot이 이미 비균일 scale이면 migration 자체는 값을 보존해 workbench에서 열어 주되, 승인 export
검증이 정확한 slot ID와 수정 방법을 제시하며 실패한다. 호환을 이유로 왜곡된 값을 production에 자동 승인하지 않는다.

회전은 90° 배수가 아니면 축 정렬 텍셀과 일치할 수 없으므로 “임의 회전까지 픽셀 퍼펙트”라고 주장하지 않는다.
NEAREST 필터는 유지하되 워크벤치가 비직각 회전에 별도 경고를 표시한다.

현 `workbench/model.mts#clampRect`는 폭/높이를 stage 640×400으로 잘라 `PositiveSize.max(4096)` 계약과 모순된다.
임의 스케일을 실제 지원하려면 크기는 0.5..4096, 좌표는 오버플로 편집이 가능한 범위로 분리하고 stage는
clip/mask만 한다. 비회전 rect는 최소 8×8 logical 교집합을 남기도록
`x ∈ [8-width, STAGE_WIDTH-8]`, `y ∈ [8-height, STAGE_HEIGHT-8]`로 clamp하고, 회전 rect는 rotated AABB에 같은
규칙을 적용한다. transform handle은 AABB의 stage 내부 최근접점에 그려 완전히 잃어버리지 않게 한다.

### 2.3 책상 1280×321 — 정수 그리드 충돌과 해법

내부 그리드가 640 폭이므로 책상은 `1280/2 = 640` 폭에 `321/2 = 160.5` 높이가 된다.
이 값은 정수는 아니지만 **정확히 0.5 격자**이며 루트 ×2 뒤에는 321 HD px가 된다.

| 후보 | 논리 높이 | `DESK_TOP` | 종횡비 정확도 | 판정 |
|---|---|---|---|---|
| 1280×**320** | 160 (정수) | 240 | 완전 일치 | 무손실. **명세 수치와 1px 차이** |
| 1280×**321** (명세) | 160.5 | 239.5 | ×2에서 완전 일치 | **채택 — 무왜곡** |
| 1280×**322** | 161 (정수) | 239 | 완전 일치 | 무손실. 명세와 1px 차이 |

**채택안 — 명세 수치 1280×321을 0.5 논리 격자로 정확히 유지한다.**

```ts
// src/ui/core/assetDimensions.ts
desk_foreground: { width: 1280, height: 321 },
```

`SlotDefinition`에 `defaultSizing?: SlotSizingState`를 추가한다. `fg-desk`는 비율을 유지하며, 한 축 custom
크기로 정확한 나머지 축을 유도하는 첫 실사용 사례다.

```ts
// workbench/model.mts — SLOT_CATALOG
{
  id: 'fg-desk',
  label: '책상 전경',
  description: '투명 PNG 전경 레이어 · 1280×321 저작, 640×160.5 무왜곡 배치',
  defaultRect: { x: 0, y: 239.5, width: 640, height: 160.5 },
  defaultSizing: { preserveAspectRatio: true, customWidth: 640 },
  layer: 30,
  downloadName: '전경_책상_기본.png',
  dimension: 'desk_foreground',
},
```

**손실량은 0**이다. `(x,y,width,height)=(0,239.5,640,160.5)`에 루트 ×2를 적용하면
`(0,479,1280,321)`이 되어 화면 하단 800에 정확히 닿는다. 이를 위해 워크벤치의 `finiteInteger`,
`Math.round`, 정수 `clampRect` 경로를 0.5 격자 정규화로 바꾸고 왕복 저장 테스트를 둔다.

### 2.4 세로 레이아웃 재배치 — 실측 좌표 전수

**현재** (`DESK_TOP = 282`, 책상 118px):

| 요소 | y | 비고 |
|---|---|---|
| HUD 상단 플레이트 | 0..26 | |
| 룸 배경 rect | 26..282 | `createInterrogationScreen`의 room rect |
| 하단 띠 rect | 210..282 | `createInterrogationScreen`의 lower-band rect |
| **용의자 초상 216×216** | **34..250** | `SUSPECT_PORTRAIT_SIZE`, portrait position |
| **태그 행 (6 facet)** | **250..276** | `TAG_ROW_Y`, `TAG_ROW_HEIGHT` |
| 책상 전경 | 282..400 | `addDeskForeground` — **초상·태그보다 나중에 addChild = 위에 그려짐** |
| 타자기 대사창 | 288 | typewriter panel position |
| 증거 트레이 | 292 | evidence tray position |
| 파트너 초상 | 296 | partner position |
| 제출/확보/조서 버튼 | 296 / 322 / 344 | 각 action control position |
| 손패 휴지 Y | 371 | `panelBottom(400) − cardRevealHeight(0.2, 145)` |

**변경 후** (`DESK_TOP = 239.5`, 책상 160.5px — 42.5px 상승):

| 요소 | y | 조치 |
|---|---|---|
| HUD 상단 플레이트 | 0..26 | 변경 없음 |
| 룸 배경 rect | 26..**239.5** | 높이 `256 → 213.5` |
| 하단 띠 rect | **167.5..239.5** | y `210 → 167.5` (높이 72 유지) |
| 용의자 초상 216×216 | 34..250 | **위치 유지.** 하단 10.5px이 책상 뒤로 들어간다 — **의도된 개선**(§2.5) |
| **태그 행** | **205.5..231.5** | **`TAG_ROW_Y = 250 → 205.5` 필수 이동.** 유지 시 책상에 완전히 가려진다 |
| 책상 전경 | 239.5..400 | `DESK_TOP` 상수 변경 |
| 타자기·트레이·파트너·버튼·손패 | 변경 없음 | 전부 239.5..400 책상 위에 그대로 안착. 여백만 넓어짐 |

### 2.5 부수 효과 — 디오라마 깊이의 개선

현재 초상 하단(250)과 책상 상단(282) 사이에 32px 공백이 있어 **용의자가 책상 앞에 떠 있는 것처럼 보인다.**
`DESK_TOP = 239.5`가 되면 초상 하단 10.5px이 책상 뒤로 들어가며, `addDeskForeground`가 초상보다 나중에
`addChild`되므로(초상 뒤 `addDeskForeground`) **별도 z-index 조작 없이** 용의자가 책상 뒤에 앉은 구도가 완성된다.

> 즉 요구사항 ⑤는 규격 변경이 아니라 **연출 개선**이다. 이 사실을 근거로 초상 축소는 하지 않는다.

#### 2.5.1 런타임 Z-order 계약

DOM CSS z-index가 아니라 Pixi scene child order를 사용한다. 화면 생성 시 고정 sub-container를 한 번 만들고 아래 순서로
추가해, asset load 완료 순서가 draw order를 바꾸지 못하게 한다.

| layer | 내용 |
|---:|---|
| 0 | room background |
| 10 | suspect base |
| 20/21 | upset/lose part (portrait sidecar layer는 이 portrait container 내부에서 stable sort) |
| 25 | statement tag row + 구분선 |
| 30 | desk foreground |
| 40~50 | typewriter/evidence tray/card fan/partner/action controls — 책상 위 콘텐츠 |
| 60 | HUD icons/gauges |
| 100+ | judgment/punish/direction/cutscene/dead/modal/error overlay; modal/error가 최상위 input owner |

`RuntimeAssetLayout`의 binding layer와 workbench catalogue layer는 같은 상수를 공유한다. `Sprite.from()` 비동기 완료 때
root에 직접 append하거나 state part의 사용자 layer를 전역 layer로 해석하지 않는다.

#### 2.5.2 ⚠️ 검산에서 드러난 중첩 — 태그 행이 초상 위로 올라온다

태그 행을 250 → 205.5로 올리면 **초상(34..250, x 212..428)의 하단부와 세로로 겹친다.**
`addChild` 순서가 초상 → 태그이므로 **태그 칩이 초상 위에 그려진다.**

| 안 | 배치 | 평가 |
|---|---|---|
| **A (채택)** | 초상 216² 유지, 태그 205.5..231.5가 초상 하단(흉부)에 겹침 | 책상(239.5↑)·태그(205.5↑)가 초상 하단을 층층이 가려 **전경 깊이가 생긴다.** "책상 앞에 놓인 진술 카드" 독해가 자연스럽다 |
| B | 초상을 216 → **171 이하**로 축소(`y=30`, 하단 ≤ 201) | 겹침 0. 대신 용의자가 21% 작아져 **표정 파츠(upset/lose) 가독성이 떨어진다** — 심문 게임의 핵심 피드백 손상 |
| C | 태그 행을 책상 위(239↓)로 이동 | 증거 트레이(292)·버튼(296~344)과 경쟁. 책상이 과밀해짐 |

**A를 채택하되 2가지 보정을 둔다:**
1. 태그 칩 배경 `alpha`를 0.94 이상으로 올려 초상이 비쳐 보이지 않게 한다.
2. 태그 행 바로 위(y=203.5)에 1px `parchmentDark` 구분선을 그어 "전경 레이어 시작선"을 명시한다.

`tests/ui/deskLayout.test.ts`(T-3)에 **"태그 행 하단 < `DESK_TOP`"** 단언은 넣되
**"태그 행과 초상이 겹치지 않는다"는 단언은 넣지 않는다** — 겹침이 의도이기 때문이다.

### 2.6 마법 상수 제거 — 책상 기준 앵커링

`fg-desk`의 production 좌표 권한은 승인 `RuntimeAssetLayout` 하나다. repository semantic validator는 target 승인본의
resolved transform이 정확히 `{x:0,y:239.5,width:640,height:160.5,rotation:0}`, `preserveAspectRatio:true`, layer 30이고
하단이 400인지 검사한다. workbench에서 다른 시안을 편집/저장할 수는 있지만 이 조건을 만족하지 않으면 production
manifest 승인을 거부한다. UI가 `ASSET_DIMENSIONS`로 별도 DESK_TOP을 계산해 sprite와 anchor가 갈라지게 하지 않는다.

```ts
// src/ui/screens/interrogation/createInterrogationScreen.ts
const deskRect = runtimeAssetLayout.require('fg-desk').rect;
const DESK_LOGICAL_HEIGHT = deskRect.height;           // 160.5
const DESK_TOP = deskRect.y;                           // 239.5
const TAG_ROW_GAP = 8;
const TAG_ROW_Y = DESK_TOP - TAG_ROW_HEIGHT - TAG_ROW_GAP;  // 205.5
```

`addDeskForeground`도 같은 `deskRect`를 사용하고, 태그/배너/트레이 anchor는 이 rect에서 파생한다. T-3는 source dimension,
manifest resolved rect, 실제 sprite bounds, 파생 anchor가 모두 같은 원천인지 검증한다. 이후 규격 변경은 dimension과 승인
manifest를 함께 version-up해야 하며 둘 중 하나만 바뀐 build는 repository/content gate에서 실패한다.

### 2.7 손패·증거 파우치 재계산 판단

명세는 손패 휴지 위치와 파우치 도킹의 재계산을 요구한다. 실측 결과:

- **파우치(증거 트레이, y=292)** — 새 책상 상단 239.5보다 아래이므로 **여전히 책상 위**다. 이동 불필요.
- **손패 휴지 Y(371)** — `panelBottom = STAGE_HEIGHT`에서 파생된다. 책상이 커져도 카드가 화면 하단에 걸리는 관계는 동일하므로 **수치 변경 불필요**.
- 다만 두 값 모두 **책상 기준으로 재표현**해 향후 규격 변경에 자동 추종하게 한다:

```ts
const DESK_SURFACE_INSET = 52.5;                     // 292 − 239.5
evidenceTray.view.position.set(6, DESK_TOP + DESK_SURFACE_INSET);
```

> **`CARD_REST_REVEAL_RATIO`를 0.2 → 0.4로 올리는 안은 기각한다.** 휴지 Y가 371 → 342가 되어
> 조서 버튼(344)과 2px까지 근접해 손패가 버튼을 가린다. 넓어진 책상 면적은 대사창·트레이 여백으로 쓴다.

### 2.8 깨지는 기존 테스트 (반드시 동반 수정)

| 파일:라인 | 현재 단언 | 조치 |
|---|---|---|
| `assetDimensions.test.ts`의 desk aspect 단언 | `matchesAssetAspectRatio('desk_foreground', {640,118}) === true` | `{640,160.5}`은 **true**가 정답. 0.5 논리 격자의 정확한 비율을 단언 |
| 같은 테스트의 640×120 단언 | `matchesAssetAspectRatio(...{640,120}) === false` | 유지 가능 |
| 같은 테스트의 전 슬롯 비율 단언 | 모든 `defaultRect`가 자기 `dimension` 비율과 일치 | 계속 유지. `fg-desk`도 정확히 일치; 부동소수 비교는 cross multiplication/허용오차 사용 |
| `placeholders.json`의 `desk_foreground` | `"height": 236` | `321`로 변경 후 `pnpm placeholder:generate` 재실행 |
| `assets/fg/전경_책상_기본.png` | 1280×236 | 1280×321 재저작(또는 플레이스홀더 재생성) |

---

## 3. Section 3 — Cutscene & Non-Combat Event Engine

### 3.1 컷씬 엔진 — 타임드 오버레이와 구분되는 입력 대기 시퀀스

기존 `TimedDirectionOverlay`와 연출 렌더러는 재사용하지만, **`showTimedDirection` 호스트를 그대로 쓰지 않는다.**
현 호스트는 생성 시 잡은 단일 `durationMs` wall-clock 타이머가 만료되면 `complete` 여부와 무관하게 완료시키고,
scene 교체로 `onDestroy`돼도 완료 콜백을 실행한다. 이는 선택 대기 중 강제 완료와 취소 중 상태 커밋을 만든다.

```ts
// src/ui/core/presentationTreatment.ts — engine import 없음
export const PRESENTATION_TREATMENTS = [
  'NONE', 'FADE_IN', 'FADE_OUT', 'SHAKE', 'FLASH', 'SLOW_FADE',
] as const;
export type PresentationTreatment = (typeof PRESENTATION_TREATMENTS)[number];

// src/ui/screens/cutscene/createCutsceneOverlay.ts (신규)
export interface CutsceneBeatView {
  readonly beatId: string;
  readonly backgroundAssetKey?: string;
  readonly portraits: readonly { side: 'LEFT' | 'RIGHT'; assetKey: string; dim: boolean }[];
  readonly speakerName?: string;
  readonly text: string;                       // 이미 t()로 해석된 완성 문자열
  readonly treatment: PresentationTreatment;
  readonly audioCue?: string;
  readonly durationMs: number;
  readonly choices: readonly { choiceId: string; label: string }[];
  readonly defaultChoiceId?: string;            // skippable branch의 app-validated 기본 경로
}

export type CutscenePlaybackState =
  | 'RUNNING'
  | 'WAITING_INPUT'
  | 'COMPLETE'
  | 'CANCELLED';
export type CutsceneBeatPhase = 'TYPING' | 'READY' | 'WAITING_CHOICE';

export interface CutsceneOverlay extends ManagedUiLayer {
  /** Beat index currently on screen. */
  readonly beatIndex: number;
  readonly playbackState: CutscenePlaybackState;
  /** Actionable sub-state inside the beat; changes are observable by autoplay. */
  readonly beatPhase: CutsceneBeatPhase;
  /** Monotonic per overlay; increments on beat/phase/choice-set changes. */
  readonly interactionRevision: number;
  update(deltaMs: number): void;
  /** TYPING→READY/WAITING_CHOICE on first call; READY→next beat on the next call. */
  advance(): void;
  choose(choiceId: string): void;
  /** From the current beat, stages every default branch choice exactly once, then completes. */
  skip(): void;
}

export function createCutsceneOverlay(
  beats: readonly CutsceneBeatView[],
  options: DirectionRendererOptions & {
    readonly skippable: boolean;
    /** Manual single choice; app stages into a new immutable draft before publishing it. */
    readonly onChoice: (beatId: string, choiceId: string) => void;
    /** Atomic skip staging; called once only after the complete default path is validated. */
    readonly onSkipChoices: (
      selections: readonly Readonly<{ beatId: string; choiceId: string }>[],
    ) => void;
    /** Returns the next beat index; lets the caller own branch resolution. */
    readonly resolveNext: (beatId: string, choiceId?: string) => number | null;
  },
): CutsceneOverlay;

export function showSequenceOverlay(
  overlay: CutsceneOverlay,
  callbacks: {
    readonly onComplete: () => void;
    readonly onCancel: () => void;
    readonly onError: (error: unknown, retry: () => void) => void;
    /** Publishes a fresh immutable autoplay scene for every interactionRevision. */
    readonly onInteractionStateChange?: () => void;
  },
): () => void;
```

세 callback은 linear cutscene에서도 필수 포트(사용되지 않으면 순수 no-op/next-index 구현)로 둔다. optional callback 때문에
choice/goto가 보이는데 gains나 분기가 사라지는 상태를 타입으로 만들지 않는다. 생성자는 추가로 choices가 있는 beat의
choice ID가 resolver에서 유효하고, `skippable:true`의 전체 default path가 batch callback으로 staging 가능한지 사전 검증한다.

수동 `choose()`의 순서는 `resolveNext` 순수 계산/검증 → app이 새 immutable draft를 로컬에서 완성한 뒤 `onChoice`로
한 번 swap → overlay beat/phase/revision swap이다. 앞 단계가 throw하면 뒤 단계는 0회이고 기존 draft/overlay state가
그대로다. skip도 같은 규칙을 batch 단위로 따른다.

**640×400 logical 레이아웃(1280×800에서 정확히 ×2):**

| 레이어 | logical rect / 규칙 |
|---|---|
| 배경 | `(0,0,640,400)`, 1280×800 source를 aspect 유지 cover. beat에 key가 없으면 직전 배경 유지 |
| 좌측 초상 | `(24,76,184,184)`, 512² source, active speaker alpha 1 / 비화자 `dim` alpha 0.45 |
| 우측 초상 | `(432,76,184,184)`, 같은 규칙. 좌·우 한 장씩만 허용 |
| 대화 패널 | `(16,274,608,110)`, speaker plate `(28,262,180,20)`, 본문 safe rect `(32,292,576,76)` |
| 선택 오버레이 | choice beat에서 `(170,148,300,112)`, 최대 4행(행 24+gap 4). 배경 딤 위 최상단이며 키보드/포인터 focus를 trap |
| 진행/skip | 전체 overlay pointertap/Enter는 typewriter 완료→advance 2단계. skip은 `(588,8,44,20)`에 두고 `skippable`일 때만 노출 |

컷씬의 `backgroundAssetKey`/`portraits[].assetKey`는 registry에서 URL만 resolve한다. 이 narrative asset들은 16개
workbench slot catalogue의 인스턴스가 아니며 **위 표의 fixed rect가 authoritative**다. `suspect-base` manifest나 portrait
sidecar transform을 컷씬 184×184 portrait에 재사용하지 않는다. 컷씬을 자유 배치해야 하는 후속 요구가 생기면 전용
`cutscene-background/left/right` slot과 manifest version을 별도로 추가해야 하며, 암묵 매핑은 금지한다. 대화/선택 패널도
픽셀 UI 고정 좌표다.
모든 텍스트는 위 safe rect에서 wrap/overflow 검사를 거치며, choice 대기 중 배경 클릭이 이벤트 화면까지 전파되면 안 된다.

choice beat도 처음에는 `RUNNING/TYPING`으로 시작해 ticker가 typewriter를 끝낸 뒤에만
`WAITING_INPUT/WAITING_CHOICE`가 된다. non-choice beat는 `RUNNING/TYPING→READY`인 동안 authored duration까지
계속 진행한다. 호스트는 `RUNNING`일 때만 ticker/비트별 watchdog을 움직이고 `WAITING_INPUT`에는 wall-clock 완료
타이머를 두지 않는다.
`onDestroy`는 `CANCELLED`로 끝내며 `onComplete`를 호출하지 않는다. `update/advance/choose/skip`의 예외는
flow error boundary로 전달하되, 재시도는 불변 정의와 아직 커밋되지 않은 이벤트 draft에서 오버레이를 다시 만든다.
터보/워치 배속은 `deltaMS × directionTimeScale`로 명시적으로 공유한다.

오토플레이에는 단순 `DIRECTION`이 아닌
`CUTSCENE { nodeId, eventId, cutsceneId, playbackGeneration, beatId, phase, revision, choiceIds, skippable,
displayStrings, choose, advance, skip }` scene을 노출한다. `playbackGeneration`은 app이 같은 node 진입/flow-error retry마다
증가시키는 non-persisted monotonic 값이다.
`displayStrings`에는 현재 speaker/text와 보이는 choice label을 넣어 raw-i18n telemetry가 연출 문자열을 놓치지 않게
한다. 그렇지 않으면 선택 비트에서 드라이버가 행동할 수 없거나, 완주해도 대사 raw key 누출을 검출하지 못한다.

현재 driver의 “scene 객체당 1회 행동”만 재사용하면 첫 `advance()`가 typewriter를 끝낸 뒤 같은 beat에서 두 번째
`advance()`를 못 해 stall한다. overlay는 TYPING→READY/WAITING_CHOICE, READY→다음 beat, 자동 beat 전환 때마다
revision을 올리고 port는 새 frozen scene을 발행한다. driver는 객체 identity가 아니라
`[nodeId,eventId,cutsceneId,playbackGeneration,beatId,phase,revision]` structured action token을 소비하며, 같은 token에는
한 번만 행동한다. `ContentIdSchema`는 `:`를 허용하므로 delimiter 문자열 연결은 금지하고 tuple 비교 또는
`JSON.stringify(tuple)`을 사용한다. cutscene/beat ID는 local scope에서 재사용될 수 있고 retry 시 revision이 0부터 다시
시작하므로 이 전체 identity를 줄이면 안 된다. callbacks도 generation을 capture해 현재 generation과 다른 늦은 이전
overlay callback을 무시한다. 이 갱신은 각 beat의
`displayStrings`를 다시 scan하는 raw-i18n 근거이기도 하다.

**연출 처리(`treatment`)** — 렌더러가 코드로 분기하지 않도록 `directionTable.ts`와 동일한 데이터 테이블 패턴:

| treatment | 구현 |
|---|---|
| `NONE` | 즉시 표시 |
| `FADE_IN` / `FADE_OUT` | 루트 컨테이너 `alpha` 보간 (240ms) |
| `SLOW_FADE` | 동일, 900ms |
| `SHAKE` | 루트 `position` 을 감쇠 사인으로 흔듦 (진폭 3px → 0, 400ms). `portrait.ts`의 셰이크와 동일 커브 공유 |
| `FLASH` | 전면 흰 `Graphics` `alpha` 0.85 → 0 (180ms) |

**입력 계약**: 자동 진행 비트는 `durationMs` 경과 시 다음 비트로, `choices`가 있는 비트는
**타이머를 멈추고 선택 대기**한다. 마지막 비트가 정상 종료됐을 때만 `playbackState === 'COMPLETE'`가 된다.

### 3.2 컷씬 배선 — 노드 진입/이탈

`NonCombatBaseShape`에 `cutscenes`를 얹었으므로(S-6) **모든 이벤트 패턴이 BEFORE/AFTER 컷씬을 각각 하나씩 가질 수 있다.**
`timing: 'BEFORE'`면 이벤트 UI 이전, `'AFTER'`면 이벤트 상호작용/결과 표시 뒤에 재생한다.
여기서 AFTER는 **런 상태 커밋 뒤**가 아니다. 컷씬 선택까지 하나의 이벤트 draft에 모은 뒤 단 한 번 커밋한다.

```
openCurrentNode()
  └ node.kind === 'EVENT'
      ├ create EventDraft (아직 RunState 변경 없음)
      ├ BEFORE → showSequenceOverlay → 선택을 draft에 기록 → mountEvent
      ├ mountEvent / 결과 preview → 선택·시도 목록을 draft에 기록
      ├ AFTER  → showSequenceOverlay → 선택을 draft에 기록
      └ finalizeEvent(draft)
            → RunSession.finishEvent 1회(persist-first) → routeAfterBoundary
```

따라서 `bootstrap.ts`에 단순 삽입만 해서는 안 된다. 특히 현 패턴 B는 `finishEvent`로 저장한 뒤 결과 화면을
보여 주므로 AFTER 컷씬이 있으면 순서를 바꿔야 한다. `evaluatePlacementEvent` 같은 순수 preview와 실제
`finishEvent` 커밋을 분리하고, 콜백 입력도 `EventDraft`를 전달하도록 확장한다.

**컷씬 선택지의 효과 적용**: 수동 `onChoice`와 skip의 단일 `onSkipChoices(batch)`는 `gains`(`SET_FLAG` 포함)를
새 immutable draft에만 모으고 검증 성공 뒤 한 번 publish한다. 마지막
`completeEventNode`는 실제 서사 순서인 `BEFORE 선택 효과 → 이벤트 비용/효과 → AFTER 선택 효과 →
applyFlagSetHooks`로 원본 node-boundary 상태에서 draft를 재생하며, 이 순서를 테스트로 잠근다. 이벤트 화면의
선택지 활성화와 projected resource도 같은 reducer의 **BEFORE+이벤트 prefix**를 사용해야 한다. 그렇지 않으면
BEFORE에서 얻은 자원/플래그와 화면의 비용 판정이 어긋난다. AFTER 선택 뒤 `finishEvent`를 두 번째 호출하는
구현은 이미 다음 노드로 이동했거나 저장된 상태를 중복 적용하므로 금지한다.

hook context는 event ID를 항상 포함하고 pattern A의 선택만 `choice`, pattern D `TUNE`만 `selection`에 넣는다.
컷씬 batch의 choice ID를 singular hook context로 축약하지 않는다. hook은 모든 draft effect가 성공한 뒤 한 번 계산되지만
save가 실패하면 새 flag store를 포함한 전체 completion object가 폐기되어 재시도 중복이 없다.

### 3.3 비전투 이벤트 3종 — 흐름

#### 패턴 D · 카드 강화 (`ENHANCE_CARD`)

```
진입 → (선택) 컷씬 BEFORE
  → 화면: 좌측 = 강화 옵션 목록(options), 우측 = 대상 카드 정의 그리드(현재 덱 4 pile의 unique card_id + copy 수)
  → ① 옵션 1개 선택  ② eligible_intents 필터를 통과한 카드 1장 선택
  → [강화] 또는 항상 활성 [지나간다(DECLINE)]
  → 확인 → draft에 기록 → (AFTER 컷씬이 있으면 재생)
  → 선택 option costs 차감 + cardTuning 누적 + option effects를 1회 원자 커밋
```

- **누적 규칙**: 같은 카드에 두 번 강화 시 `cpDelta` 등이 **합산**된다. 하한은 소비 시점에 `max(0, …)`로 잠근다.
- **표시 규칙**: 덱은 card ID 중복 배열이므로 물리 복사본을 카드 타일 여러 개로 오인하게 만들지 않는다. draw/hand/
  discard/exhaust 전체를 합쳐 unique `card_id` 한 타일과 `×N` copy 수를 표시하고, 선택 결과는 그 definition ID다.
- **eligible 규칙**: intent filter, 실제 owned definition, 누적 tuning overflow 없음에 더해 option 적용 전/후
  `EffectiveCardDefinition`이 달라야 한다. CP 0에서 추가 CP 감소처럼 realized 변화가 0인 pair는 비활성/목록 제외하며
  costs를 낼 수 없다. 여러 필드 중 하나라도 실제로 변하면 eligible이고 summary는 필드별 realized delta만 보여 준다.
- **불변식**: 덱이 비어 있거나 `eligible_intents`를 만족하는 카드 정의가 0장이면 비용을 차감하지 않고
  필수 `fallback_gains`를 `FALLBACK`으로 커밋한다. eligible 쌍이 있으면 `FALLBACK`은 금지하되 `DECLINE`은 항상
  허용하고 아무 상태 효과 없이 노드를 끝낸다. option별 `effects` 외의 암묵 gains를 가정하지 않는다.

#### 패턴 E · 탐문 (`CANVASS`)

```
진입 → 화면: 탐문 대상(topics) 목록 + "남은 탐문 n/attempt_limit"
  → 1건 선택 → draft의 projected resource로 비용 가능 여부 검증 → 선택/effect를 staging
  → reveal_key 텍스트를 결과 패널에 누적 표시 (플레이어가 읽을 시간을 준다)
  → attempt_limit 소진 or "탐문 종료" 클릭 → 전체 cost/effect를 authored 선택 순서로 1회 커밋
```

- **패턴 C와의 차이**: C(제한 조사)는 즉시 종료되지만 **E는 결과 텍스트를 누적 표시하고 명시적 종료 버튼을 준다.** §감사 P-9(패턴 C에 결과 피드백 없음)를 E에서 선반영한다.
- 커밋 성공 시에만 `canvassedTopicIds`에 기록해 **런 전체에서 같은 화제를 재탐문할 수 없게** 한다.

#### 패턴 F · 증거 수집/감식 (`COLLECT_EVIDENCE`)

```
진입 → 화면: 감식 대상(targets) 그리드 + 등급 뱃지(A/B/C)
  → 1건 선택 → draft의 projected resource로 비용 가능 여부 검증
  → provisional 획득 연출(증거 카드 확대 → 파우치로 날아가는 트윈), 아직 RunState 변경 없음
  → attempt_limit 소진/명시적 종료 → 전체 비용/effect와
    RunState.acquiredEvidenceIds += evidence_id, evidenceGradeById[evidence_id] = grade를 1회 커밋
```

- **중복 방어**: 이미 `acquiredEvidenceIds`에 있는 증거는 목록에서 **비활성 + "이미 확보" 라벨**로 표시한다. §감사 C-5(이벤트 증거 보상이 전부 기획득이라 실질 0)의 재발 방지.
- **등급 보존**: `acquiredEvidenceIds`는 소유 여부만 표현한다. F의 `grade`와 `UPGRADE_EVIDENCE`는
  `evidenceGradeById`에 저장하고 다음 encounter 생성 시 동일 등급으로 주입한다.
- **target별 reducer 순서**: authored 선택 순서대로 `cost → acquiredEvidenceIds append → F grade override 설정 →
  target.effects 배열 순서`를 적용한다. 따라서 같은 target의 effect가 방금 획득한 증거를 `UPGRADE_EVIDENCE`할 수 있고,
  아래 `nextAuthoredGrade` 검증은 F가 설정한 grade에서 시작한다. 이 순서를 UI projected reducer와 commit reducer가 공유한다.

### 3.4 `RunEffectSchema` + exhaustive reducer — 조용한 무시의 종식

현재 `applyRunEffects`는 `GRANT_EVIDENCE`·`ADJUST_RESOURCE`만 처리하고 나머지를 `continue`로 버린다.
D/E/F는 다음 3종을 추가로 요구한다:

| EffectType | 런 레벨 동작 | 신규 |
|---|---|---|
| `GRANT_EVIDENCE` | `acquiredEvidenceIds` 추가 | 기존 |
| `ADJUST_RESOURCE` (stress/dp/trust) | 자원 가감 | 기존 |
| `UPGRADE_EVIDENCE` | 현재 등급(override가 없으면 authored initial)에서 effect의 명시적 `to`로 변경. `to !== nextAuthoredGrade(def,current)`이거나 미획득 증거면 커밋 전 거부 | **신규** |
| `OPEN_ROUTE` | `openRouteIds`에 추가해 `target_slot`이 실제 encounter claim surface에 속하는 다음 compatible 전투에만 주입하고, 그 전투가 성공적으로 커밋된 뒤 주입한 ID만 소비 | **신규** |
| `SET_FLAG` | 플래그 직접 설정 (D/E/F 공통) | **신규** |

`evidenceGradeById`는 **override map**이다. 키가 없는 기획득 증거는 catalogue의 `grade.initial`을 사용하며 unknown으로
취급하지 않는다. `GRANT_EVIDENCE`는 소유 ID만 추가하고, F의 명시 grade 또는 `UPGRADE_EVIDENCE`가 있을 때 override를
쓴다. 현 `EvidenceUpgradeSchema`는 `{to,cost,via}`만 있고 `from`이 없으므로 “authored direct edge”를 임의로 상상하지
않는다. 현재 coordinator와 동일한 다음 등급 resolver를 공용 순수 함수로 추출한다.

```ts
const GRADE_RANK = { C: 0, B: 1, A: 2 } as const;

function nextAuthoredGrade(definition: EvidenceDefinition, current: Grade): Grade | undefined {
  return unique(definition.grade.upgrades.map((upgrade) => upgrade.to))
    .filter((candidate) => GRADE_RANK[candidate] > GRADE_RANK[current])
    .sort((a, b) => GRADE_RANK[a] - GRADE_RANK[b])[0];
}
```

`UPGRADE_EVIDENCE.to`는 이 함수 결과와 정확히 같아야 한다. F의 authored `grade` reachability도 initial에서 이 함수를
0회 이상 반복해 도달 가능한지 검사한다. duplicate `upgrades.to`는 콘텐츠 gate가 거부하고, no-next/A→상향·등급
하향/건너뛰기(더 가까운 authored grade가 있을 때)는 상태 변경 전에 실패한다. encounter와 run reducer가 이 같은 함수를
공유해 저장 전후 등급 의미가 달라지지 않게 한다.

범용 `EffectSchema`는 30여 종을 허용하므로 이벤트 배열에 그대로 쓰지 않는다. 전용 `RunEffectSchema`가
각 타입의 필수 `target/resource/delta/value/to`와 런에서 허용되는 자원(`stress/dp/trust`)을 강제한다.
리듀서는 판별 유니온을 exhaustive switch로 처리하고 `assertNever`에 도달하면 **모든 빌드에서 throw**한다.
기존 A `choices.gains`와 C `spots.effects`도 이 전용 스키마로 바꿔 A~F 전체에 같은 계약을 적용한다.

```ts
switch (effect.type) {
  case 'GRANT_EVIDENCE': /* ... */ break;
  case 'ADJUST_RESOURCE': /* ... */ break;
  case 'UPGRADE_EVIDENCE': /* ... */ break;
  case 'OPEN_ROUTE': /* ... */ break;
  case 'SET_FLAG': /* ... */ break;
  default: assertNever(effect);
}
```

DEV `console.warn` 뒤 계속 진행하는 안은 프로덕션에서 여전히 데이터를 버리고 부분 커밋을 허용하므로 기각한다.
검증 실패는 상태 변경 전에 발생해야 하며, `applyRunEffects`는 중간 객체만 만들고 마지막에 반환해 원자성을 지킨다.

### 3.5 이벤트 화면 확장

`createEventScreen`의 분기를 `switch (model.pattern)`으로 바꾸고 D/E/F 케이스를 추가한다.
`EventSceneModel` 판별 유니온에도 3종을 더한다(`src/ui/screens/event/model.ts`).

**동시 반영 (감사 지적 해소)** — 신규 패턴만 새 규칙을 따르면 화면이 이질적이므로 A/C도 함께 정리한다:

| 항목 | 조치 | 근거 |
|---|---|---|
| 비용·획득 표시 | 현 A 화면은 이미 버튼 아래 `비용 … | 획득 …` 텍스트를 렌더한다. 이 동작을 회귀 잠금하고 공용 chip/label 컴포넌트로 D/E/F에도 확장 | 현재 `createEventScreen` 실측 |
| 자원 부족 처리 | 비용을 못 내는 선택지는 **비활성 + 사유 툴팁**. 현재는 눌러도 무반응(예외가 콘솔로만 감) | 감사 UI-E3 |
| 패턴 C 결과 피드백 | 조사 결과를 누적 표시 (E와 동일 컴포넌트 공유) | 감사 P-9 |

### 3.6 이벤트 트랜잭션·세이브·오류 경계 (필수 계약)

현재 `RunSession`은 노드 경계에서 `persist first → in-memory commit`하고, 활성 이벤트/전투 중간 상태는 저장하지
않는다. D/E/F도 이 계약을 유지한다. 즉 **중간 클릭마다 RunState를 바꾸지 않는다.**

```ts
interface EventDraftBase {
  readonly nodeId: string;
  readonly eventId: string;
  readonly cutsceneChoices: readonly {
    readonly timing: 'BEFORE' | 'AFTER';
    readonly beatId: string;
    readonly choiceId: string;
  }[];
}

/** Every A-F input is represented without optional-field guessing. */
type EventDraft =
  | (EventDraftBase & { readonly pattern: 'A'; readonly choiceId: string })
  | (EventDraftBase & {
      readonly pattern: 'B';
      readonly placement: Readonly<Record<string, string>>;
    })
  | (EventDraftBase & {
      readonly pattern: 'C';
      readonly investigatedSpotIds: readonly string[];
    })
  | (EventDraftBase & {
      readonly pattern: 'D';
      readonly selection:
        | { readonly kind: 'TUNE'; readonly optionId: string; readonly cardId: string }
        | { readonly kind: 'FALLBACK' }
        | { readonly kind: 'DECLINE' };
    })
  | (EventDraftBase & {
      readonly pattern: 'E';
      readonly selectedTopicIds: readonly string[];
    })
  | (EventDraftBase & {
      readonly pattern: 'F';
      readonly selectedTargetIds: readonly string[];
    });

prepareEventCompletion(state, event, draft): RunEventCompletion; // pure, no save
RunSession.finishEvent({ eventDefinition: event, draft });        // persist-first once
```

- `draft.pattern`과 `event.pattern`은 반드시 같아야 하고 reducer는 A~F를 exhaustive switch로 처리한다. 기존 A의
  `choiceId`, B의 `placement`, C의 `investigatedSpotIds`도 이 union에 포함되므로 “신규 이벤트만 원자 커밋”하는
  이중 경로가 생기지 않는다. D의 eligible `(option,card)` 쌍이 0개일 때만 `FALLBACK`을 허용하고, 대상이 있는데
  fallback을 고르는 입력은 거부한다. `DECLINE`은 항상 적법하며 비용/tuning/effect가 0인지 reducer가 단언한다.
  DECLINE도 AFTER 컷씬을 거친 뒤 event-only flag hook(`selection` 없음)과 persist-first node 완료를 수행하므로 화면을
  그냥 닫아 현재 EVENT에 머무르는 구현은 금지한다.
- draft를 신뢰하지 않는다. `prepareEventCompletion`은 BEFORE/AFTER cutscene을 시작 beat부터 다시 걸어 각 choice가
  실제 도달 경로에 있고 choice beat마다 정확히 하나이며 순서·timing이 맞는지 검증한다. A choice, B mapping, C/E/F
  unique selection/attempt limit, D option/eligibility도 authored definition과 재대조하고, projected prefix마다 비용 지불
  가능성을 확인한 뒤에만 새 state를 만든다.
- 이 재검증은 현재 state도 다시 본다. D card가 네 pile 중 하나에 여전히 존재하고 intent + effective before/after
  non-noop eligibility를 만족하는지,
  E topic이 `canvassedTopicIds`와 앞선 draft selection에 없는지, F evidence가 `acquiredEvidenceIds`와 앞선 target의
  implicit/effect 획득에 없는지를 commit 직전에 확인한다. stale UI가 만든 draft를 그대로 적용하지 않는다.
- UI는 매 선택 후 projected resource를 다시 계산해 감당 불가능한 다음 항목을 비활성화한다.
- 새로고침/화면 취소 전에는 draft가 사라지고 **노드 시작 상태로 복귀**한다. 이미 비용만 빠지는 상태는 없다.
- 저장 실패 시 `RunSession.snapshot`은 이전 상태 그대로이고 같은 immutable draft로 재시도할 수 있다.
- 커밋 성공 후 같은 callback이 재진입해도 `nodeId/eventId`가 현재 노드와 달라 거부된다.
- 중간 진행 복원이 제품 요구가 되면 `pending_event`를 별도 저장하는 후속 설계가 필요하다. 현재 설계에
  “클릭 즉시 적용”과 “노드 경계 저장”을 동시에 적어 두고 구현자에게 맡기지 않는다.
- 이 경계에서는 E reveal/F provisional 연출을 본 뒤 새로고침해 비용 없이 노드를 다시 보는 **서사 정보 save-scum**은
  가능하다. 상태 중복·부분 차감은 없지만 플레이어의 기억까지 롤백할 수는 없다. 이를 제품상 금지해야 한다면
  `pending_event`와 선택별 persist-first checkpoint가 필요하며, 현재 node-boundary-only 설계가 방지한다고 주장하지 않는다.

오토플레이 표면도 함께 확장한다.

판정 배너처럼 scene 전환 사이에 잠깐만 존재하는 문자열의 관측 계약은
[자매 카드/워크벤치 설계](./card_contradiction_workbench_design.md) §2.3.1을 그대로 공유한다. 모든 L2 scene은
`AutoplayScenePresentation { presentationRevision, pendingPresentations, ackPresentation }`을 합성하고,
INTERROGATION은 `previewSubmission(selection)`을 노출한다. driver는 **모든 다음 action 직전** 현재 frozen scene의
`displayStrings`와 아직 ack되지 않은 `pendingPresentations`를 scan해 report evidence와 raw-i18n 결과를 먼저 기록하고,
그 기록이 성공한 item만 `ackPresentation(id)`한다. ack 뒤 queue가 빌 때까지 새 revision을 다시 발행하며, 시간 경과나
scene kind 변경만으로 item을 drop하지 않는다. 실제 제출은 deterministic preview 후보를 한 번 호출한 뒤 생긴 PREVIEW를
최소 한 render tick 관측·scan·ack한 후에만 가능하고, 제출 뒤 RESOLUTION도 같은 순서를 마치기 전에는 다음 action을
허용하지 않는다.

`AutoplayNodeReport.presentationEvidence`는 각 queue item에 대해
`{id, kind, presentationRevision, text, scannedBeforeAck:true}`를 정확히 한 번 남긴다.
encounter별로 PREVIEW evidence와 `AutoplayNodeReport.previewNotApplicable?: true`는 상호 배타적이다. 후자는 deterministic legal
CONFIRM/CONTRADICT 후보가 실제로 0개일 때만 허용하며, callback 부재, enqueue/scan timeout, raw key, queue 유실은
`not applicable`로 치유하지 않고 invariant failure다. 일반 재생/세이브에는 이 QA-only queue나 evidence를 넣지 않는다.

- `AutoplayScene.EVENT.pattern` 유니온과 bootstrap callback에 D/E/F action을 추가한다.
- L2 `driver.ts`의 A/B/else(C) 분기를 exhaustive switch로 바꾸고 D 옵션+카드, E topic+종료,
  F target+종료를 결정론적으로 수행한다.
- D scene은 `tunePairs[{optionId,cardId,autoplayPriority,affordable,displayStrings}]`, `fallbackAvailable`, `tune(pair)`, `fallback()`,
  **항상 존재하는 `decline()`**을 노출한다. `tunePairs`는 before/after non-noop semantic eligible pair이고 affordability는
  BEFORE prefix가 반영된 현재 projected resource로 별도 계산한다. pair가 0이면 `fallbackAvailable=true`여서 fallback,
  pair는 있지만 affordable pair가 0이면 best/turbo/video는 decline한다. affordable pair가 있으면 BEST는
  `autoplayPriority DESC, optionId ASC, cardId ASC`의 공용 순수 selector로 tune하고 turbo/video도 BEST policy일 때 같은
  selector를 사용한다. 현 `TICKET_TRADE_CHOICE_ID` 하드코딩은 삭제하고 canonical question option의 유일 최고 priority와
  F-12 결과를 `autoplay-policy`/full-run 회귀로 잠근다. 그 밖의 정책은 명시된 tie-break를 사용하고,
  fuzz는 legal tune/decline만 seed 선택한다. 비용 불가 pair를 시도한 뒤 stall로 버티지 않는다.
- L1 `autoPlayHarness.completeEvent`도 A/B/else(C) 가정을 제거한다.
- 컷씬은 `CUTSCENE` scene으로 choice/advance/skip을 노출한다. `DIRECTION`으로 숨기면 choice에서 정지한다.
- CUTSCENE mode 정책은 고정한다. `turbo`는 TYPING과 READY revision마다 `advance()`해 2단계를 빠르게 통과하고,
  `watch/record/video`는 non-choice beat의 authored timer를 기다리며 `WAITING_CHOICE`에서만 정책 choice를 누른다.
  `video`는 policy와 무관하게 서사 컷씬을 `skip()`하지 않는다. `fuzz`의 seed 기반 skip은 non-video mode의 skippable
  컷씬에서만 허용하며 어느 경우든
  같은 action token을 두 번 소비하지 않는다.
- scene/action identity는 `nodeId+eventId+cutsceneId+playbackGeneration+beatId+phase+revision` 전체다. 서로 다른 event의
  local cutscene/beat ID 재사용과 동일 event retry를 별도 action으로 처리하고 stale generation callback은 행동하지 않는다.
- CUTSCENE의 speaker/text/choice label, A~F의 결과/reveal/cost label, DEAD_SCENE의 title/cause/summary/action을
  각 scene의 `displayStrings`에 넣고 report의 raw-i18n collector가 모든 신규 scene kind를 순회한다. 위 queue에서
  합성된 PREVIEW/RESOLUTION은 `pendingPresentations`와 node report evidence 양쪽에서 ID·revision이 일치해야 한다.
- 이벤트 draft는 보고서의 노드 완료 수를 늘리지 않으며, 성공 커밋 한 번만 1노드로 기록한다.

`AutoplayNodeReport`에는 EVENT에서만 존재하는 `eventPattern?: 'A'|'B'|'C'|'D'|'E'|'F'`를 추가한다. driver는 해당
노드에서 처음 본 EVENT scene의 pattern을 기록하고 같은 node에서 다른 pattern이 보이면 즉시 invariant failure로 처리한다.
report validator는 아래 canonical `nodeId/ref/pattern` join과 histogram을 직접 대조하고 encounter/BOSS report에
`eventPattern`이 있으면 거부한다. 정적 bundle join만 통과하고 런타임 report에는 pattern 근거가 없는 상태를 합격으로 보지 않는다.

---

## 4. Section 4 — Dead Scene System & Audio Visuals

### 4.1 발동 조건 — 코드 기준 정정 (§0.3 D-1)

데드씬은 **전투가 `FAILED`로 종료될 때** 발동한다. 자원/경로 평가기는 사유를 4종으로 분류한다:

| 사유 | 조건 | 근거 |
|---|---|---|
| `STRESS_DEPLETED` | `resources.stress <= 0` — 형사의 체력/정신력 **소진** | `evaluateOutcome` stress branch |
| `COERCION_LIMIT_EXCEEDED` | `resources.coercion > coercionLimit` — 강압 한계 초과 | `evaluateOutcome` coercion branch |
| `TURN_LIMIT_EXCEEDED` | `resources.turn > turnLimit` — 심문 시간 초과 | `evaluateOutcome` turn branch |
| `NO_SOLVABLE_PATH` | 필수 목표 달성 경로 소멸 | `evaluateOutcome` solvability branch |

**타입 사실 (실측)**: 사유의 실제 타입명은 `FailureReason`이 아니라 **`OutcomeReason`**이며,
`STRESS_DEPLETED`·`COERCION_LIMIT_EXCEEDED`·`TURN_LIMIT_EXCEEDED`·`NO_SOLVABLE_PATH` 외에
`COMPOSURE_DEPLETED`·`BEST_AVAILABLE`·`BEST_CONFIRMED`·`TURN_LIMIT_REACHED`·`NONE`을 포함한
**9멤버 유니온**이다. 또한 `EncounterCoordinator`는 판정 효과가 즉시 실패를 만들 때
`FAILED/NONE`을 산출한다. 따라서 4종 `Extract`만으로는 전수 매핑이 아니다:

```ts
// src/ui/screens/ending/deadSceneModel.ts — engine import 없음
export type DeadSceneReason =
  | 'STRESS_DEPLETED'
  | 'COERCION_LIMIT_EXCEEDED'
  | 'TURN_LIMIT_EXCEEDED'
  | 'NO_SOLVABLE_PATH'
  | 'PROCEDURAL_FAILURE';

/** UI-local, already localized; createDeadSceneScreen never imports app/i18n or engine. */
export interface DeadSceneView {
  readonly reason: DeadSceneReason;
  readonly illustrationAssetKey: string;
  readonly title: string;
  readonly cause: string;
  readonly summaryLines: readonly string[];
  readonly retryLabel: string;
  readonly terminateLabel: string;
  readonly audioCue: string;
  readonly treatment: PresentationTreatment;
}

// src/app/deadScenePresentation.ts — engine OutcomeEvaluation → UI view 변환 경계
export function deadSceneReason(evaluation: OutcomeEvaluation): DeadSceneReason {
  if (evaluation.terminalOutcome !== 'FAILED') throw new Error('Not a failed outcome.');
  switch (evaluation.reason) {
    case 'STRESS_DEPLETED':
    case 'COERCION_LIMIT_EXCEEDED':
    case 'TURN_LIMIT_EXCEEDED':
    case 'NO_SOLVABLE_PATH': return evaluation.reason;
    case 'NONE': return 'PROCEDURAL_FAILURE'; // current immediate procedural failure
    // These reasons normally belong to non-FAILED outcomes. If paired with FAILED,
    // render a safe procedural scene and emit an invariant diagnostic/report entry.
    case 'COMPOSURE_DEPLETED':
    case 'BEST_AVAILABLE':
    case 'BEST_CONFIRMED':
    case 'TURN_LIMIT_REACHED': return 'PROCEDURAL_FAILURE';
    default: return assertNever(evaluation.reason);
  }
}
```

모든 현행 `OutcomeReason`을 명시적으로 열거해 런타임 화면은 total mapping을 유지하면서도, 새 reason이 추가되면
컴파일 단계에서 이 projection을 갱신하도록 강제한다. 정상적으로 나올 수 없는 `FAILED + success reason` 조합은
화면을 깨뜨리지는 않되 autoplay의 `invariantFailures`와 기술 로그에는 반드시 남긴다.

`deadSceneTable.ts`는 key/preset만 제공하고 app의 `deadScenePresentation.ts`가 `t()`로 완성 `DeadSceneView`를 만든다.
`createDeadSceneScreen`은 위 UI-local view만 받는다. UI에서 `OutcomeEvaluation`, engine module, `src/app/i18n.ts`를
import하면 각각 UI→engine 금지 또는 app이 이미 UI screen/type을 조립하는 경로와의 circular dependency를 만든다.

**배선 사실 (실측)**: `OutcomeEvaluation = { terminalOutcome, terminal, bestResolution, reason }`이고
`bootstrap.ts#queueEncounterOutcome(evaluation, …)`이 **이미 `evaluation` 전체를 받는다.**
따라서 라이브 화면은 `evaluation`을 받을 수 있지만, `evaluation.reason`을 테이블에 그대로 넣지 않고 위 정규화를
거친다. 데드씬은 pre-commit transient UI이므로 새로고침 뒤에는 복원하지 않고 마지막 node boundary에서 같은
전투를 다시 연다(§4.5).

> **명세의 "스트레스 100% 달성"은 `STRESS_DEPLETED`(0 도달)로 읽어야 한다.**
> HUD가 스트레스를 잔량 게이지로 보여주므로 플레이어 체감은 동일하다.

### 4.2 데드씬 프리셋 — 데이터 테이블

`directionTable.ts`와 동일한 "렌더러는 분기하지 않고 테이블이 고른다" 패턴:

```ts
// src/ui/screens/ending/deadSceneTable.ts (신규)
export interface DeadScenePreset {
  readonly illustrationAssetKey: string;
  readonly titleKey: string;
  readonly causeKey: string;
  readonly audioCue: string;
  readonly treatment: PresentationTreatment;
}

export const DEAD_SCENE_TABLE: Readonly<Record<DeadSceneReason, DeadScenePreset>> = {
  STRESS_DEPLETED: {
    illustrationAssetKey: 'dead/과로/base',
    titleKey: 'dead.stress.title',      // "형사 김태훈, 쓰러지다"
    causeKey: 'dead.stress.cause',
    audioCue: 'sting_collapse',
    treatment: 'SLOW_FADE',
  },
  COERCION_LIMIT_EXCEEDED: {
    illustrationAssetKey: 'dead/징계/base',
    titleKey: 'dead.coercion.title',    // "수사권 박탈"
    causeKey: 'dead.coercion.cause',
    audioCue: 'sting_gavel',
    treatment: 'FLASH',
  },
  TURN_LIMIT_EXCEEDED: {
    illustrationAssetKey: 'dead/시한/base',
    titleKey: 'dead.turn.title',        // "구속 시한 만료"
    causeKey: 'dead.turn.cause',
    audioCue: 'sting_clock',
    treatment: 'FADE_IN',
  },
  NO_SOLVABLE_PATH: {
    illustrationAssetKey: 'dead/미제/base',
    titleKey: 'dead.unsolvable.title',  // "미제 사건"
    causeKey: 'dead.unsolvable.cause',
    audioCue: 'sting_file_close',
    treatment: 'SLOW_FADE',
  },
  PROCEDURAL_FAILURE: {
    illustrationAssetKey: 'dead/절차/base',
    titleKey: 'dead.procedural.title',
    causeKey: 'dead.procedural.cause',
    audioCue: 'sting_procedural',
    treatment: 'FLASH',
  },
};
```

`FADE_OUT`은 이전 scene을 걷어내는 전환 레이어용이며 새 dead root의 진입 treatment로 금지한다. dead root 자체를
alpha 1→0으로 만들면 원인/버튼이 투명한 채 입력을 기다리게 된다. 위 preset은 모두 treatment 종료 뒤 root alpha=1,
두 action의 hit-test가 활성인 상태로 수렴해야 하며 table validator가 dead preset의 `FADE_OUT`을 거부한다.

에셋 레지스트리 키는 파일명의 `category/name/state` 3구간 계약을 지켜야 한다. 두 구간
`dead/과로`는 현재 `buildAssetRegistry`가 생성하는 어떤 키와도 일치하지 않는다.

### 4.3 렌더링 순서

```
전투 FAILED 평가 (queueEncounterOutcome) — 아직 finishEncounter 호출 전
 ├ 1. FailedEncounterDraft를 app 메모리에 생성
 │     (evaluation + encounter projection + grade metrics + authored outcome reward + summary)
 ├ 2. 기존 판정/종료 연출 재생
 ├ 3. DEAD_SCENE_TABLE[deadSceneReason(evaluation)] 조회
  ├ 4. app이 preset key+summary를 로컬라이즈해 DeadSceneView 생성
  ├ 5. createDeadSceneScreen(view, actions) 마운트
  │     ├ treatment 진입 연출 (SLOW_FADE 900ms / FLASH 180ms …)
  │     ├ 패배 일러스트 (전면, alpha 0.55 딤)
  │     ├ 타이틀 (view.title, 24px, UI_PALETTE.red)
  │     ├ 실패 원인 요약 (view.cause, 타자기 연출)
  │     ├ 런 요약: 도달 노드 n/15 · 해결 진술 수 · 획득 증거 수 · 실패 시 강압
  │     └ 액션 2종
  │          [view.retryLabel]     → draft/encounter-local 상태 폐기, 현 node 재생성
  │          [view.terminateLabel] → TERMINATE: finishEncounter(FAILED) 1회 후 런 요약/배드 엔딩
  └ 6. 선택 전에는 대기 — 자동 진행 금지
```

`[진행 기록으로]`는 현 세이브 불변식상 “런을 유지한 채 strip에서 다음 노드로 진행”이 아니다. 최종 FAILED를
커밋하면 `terminal=true`이고 `nodeIndex`는 현 노드에 머무르므로, 버튼은 **종료된 런의 진행 기록/엔딩으로
돌아간다.** 계속 가능한 strip 복귀로 구현하면 `assertRestoredRunStateSemantics`와 충돌한다.

**오디오**: `soundRegistry.ts`의 `STINGER_IDS/SoundId/SOUND_REGISTRY`에 5종(`sting_collapse`,
`sting_gavel`, `sting_clock`, `sting_file_close`, `sting_procedural`)을 추가하고 `assets/bgm/*.ogg`를 공급한다.
레지스트리에만 등록하고 파일이 없으면 런타임은 no-op할 수 있지만, 프로덕션 완성 기준에서는 콘텐츠 검증과
autoplay missing-asset/audio 검사를 통과해야 하므로 **비차단이라고 선언하지 않는다.**

### 4.4 재시도 — `commitEncounter` 이전 app 트랜잭션

현재 `FAILED` 1회로 **런 전체가 즉시 `terminal`이 되어 배드 엔딩으로 직행**한다(감사 R-6).
원인은 `queueEncounterOutcome` 시작부가 연출 전에 `commitEncounter(outcome)`을 호출하기 때문이다.
FAILED만 이 호출보다 먼저 분기한다. 엔진 `CompleteEncounterNodeInput`에 `failurePolicy`를 추가하지 않는다.

```ts
// src/app/bootstrap.ts (개념 계약)
interface FailedEncounterDraft {
  readonly evaluation: OutcomeEvaluation;
  readonly finishInput: Omit<FinishEncounterInput, 'outcome'>;
  readonly summary: DeadSceneSummary;
}
```

| 정책 | 동작 |
|---|---|
| `RETRY` (기본) | `RunSession.finishEncounter`를 호출하지 않는다. 실패한 coordinator/draft를 폐기하고, **변하지 않은 `RunSession.snapshot`**에서 같은 현 노드를 다시 연다. node/history/grade/reward/flag/save 변화 0 |
| `TERMINATE` (`진행 기록으로`) | 캡처한 draft로 `finishEncounter({ outcome:'FAILED', ...finishInput })`를 **정확히 1회** 호출한다. 현행처럼 `outcomeHistory/gradeHistory`에 1건 기록하고 terminal save 후 엔딩으로 간다 |

RETRY 횟수·자원 회복·패널티는 원 요구사항에 없다. `retry.max_per_run`, `stress_restore`, `retryCount`를 기본
스키마에 발명하지 않는다. 제한이 필요하면 별도 제품 결정을 받은 후 balance/save/autoplay 정책과 함께 추가한다.

결정성은 현 `encounterSeed(state) = runSeed + f(nodeIndex)`에서 자동으로 성립한다. RETRY가 RunState를 바꾸지
않으므로 같은 RNG seed와 같은 node-boundary 자원/덱으로 재생성된다.

두 액션은 boolean latch가 아니라 다음 명시적 one-shot 상태 머신을 공유한다.

```ts
type DeadSceneActionState =
  | 'IDLE'
  | 'PENDING_RETRY'
  | 'PENDING_TERMINATE'
  | 'COMMITTED'
  | 'DESTROYED';
```

`IDLE`에서만 한 action을 CAS로 PENDING에 넣고 즉시 두 버튼/pointer/keyboard를 모두 disable한다. PENDING 중 더블클릭과
다른 action은 0회다. TERMINATE persist-first 성공은 `PENDING_TERMINATE→COMMITTED`; 실패는 RunSession이 이전 상태임을
확인한 뒤 **오류 UI를 열기 전에 `→IDLE`**로 되돌리고, flow error boundary의 retry thunk가 같은 terminate action을 새로
한 번 호출한다. 따라서 early latch가 재시도를 영구 차단하거나 late latch가 저장을 두 번 시작하지 않는다.
RETRY 화면 재생성도 `IDLE→PENDING_RETRY→DESTROYED`이고 기술 생성 실패 시 `→IDLE`로 돌아간다. 기술 재시도와
gameplay RETRY를 같은 버튼/콜백으로 합치지 않는다.

L2 포트에는 `DEAD_SCENE { reason, displayStrings, retry(), terminate() }`를 별도 scene으로 노출한다. title/cause,
런 요약, 두 action label을 `displayStrings`로 수집한다. best/video 정책에서
예상 밖 FAILED는 리포트를 실패 처리하고, dead-scene 전용 테스트 정책은 `retry/terminate`를 명시적으로 선택한다.
fuzz는 seed로 액션을 결정하되 무제한 RETRY 루프가 report timeout을 숨기지 않도록 동일 노드 반복 상한을
**드라이버 안전장치**로만 둔다(게임 balance/save 규칙으로 저장하지 않는다). report에는 retry attempt를 노드
완료와 분리해 기록한다.

```ts
// src/dev/autoplay/report.ts — node completion/history와 별도인 관측 스키마
export interface DeadSceneAttemptReport {
  readonly nodeId: string;
  readonly reason: DeadSceneReason;
  readonly attemptIndex: number; // same node에서 1부터 증가, 양의 정수
  readonly action: 'RETRY' | 'TERMINATE';
}

export interface AutoplayReport {
  // existing fields...
  readonly deadSceneAttempts: readonly DeadSceneAttemptReport[];
}
```

normal best/video 완주에서는 `deadSceneAttempts=[]`가 필수다. forced-failure/fuzz report는 node/history 완료 수와
이 배열을 섞지 않고, `(nodeId,attemptIndex)` 유일성·연속성, TERMINATE 뒤 같은 런의 추가 attempt 0을 검증한다.

### 4.5 세이브 반영

데드씬 자체와 `FailedEncounterDraft`는 저장하지 않는다. 현재 저장 계약은 node boundary 전용이고 활성 encounter도
`encounter:null`로 저장하기 때문이다.

- 데드씬에서 새로고침/프로세스 종료 → 마지막 node-boundary save가 로드되어 같은 노드를 다시 시작한다.
  이는 RETRY와 동일한 상태 결과이며 실패 history는 생기지 않는다.
- RETRY 클릭 → save write 0. 기존 저장 바이트도 변하지 않는다.
- TERMINATE 클릭 → 기존 `finishEncounter(FAILED)` 경로가 terminal save를 1회 쓴다.
- 따라서 데드씬 때문에 `retry_count/pending_failure`나 별도 save migration을 추가하지 않는다.
- save v2 증가는 D/E/F의 영속 필드(`card_tuning`, `canvassed_topic_ids`, `evidence_grade_by_id`,
  `open_route_ids`)와 stale 진행을 막는 `run_contract_fingerprint` 때문이며 재시도와는 무관하다.

앱 부팅 복원은 현재 의미 검증을 유지한다. 마지막 outcome이 현 노드의 `FAILED`면 terminal ending으로,
그 외 현 노드는 정상 진입으로 라우팅한다. “FAILED인데 terminal:false” 예외를 허용하지 않는다.

---

## 5. Section 5 — Verification & Quality Gates

### 5.1 신규 테스트

| # | 파일 | 검증 대상 |
|---|---|---|
| T-1 | `tests/ui/assetTransform.test.ts` | 해석 4개 유효/2개 금지 · SCALE↔CUSTOM/lock 무점프 · 0.5..4096 + rotated AABB 8px 가시성 · x/y 0.5 grid · aspect ON exact/파생 size 경고, OFF size grid/왜곡 경고 · strictPixelScale · 비직각 회전의 center-origin workbench/Pixi bounds 일치 · 암묵적 1/n 변경 0 |
| T-2 | `tests/ui/assetManifest-migration.test.ts` | manifest v2→v3 렌더 무변경(비제로 rotation 포함) · workbench v2→v3→v4/v3→v4/idempotent/key 유지 · future v5 무덮어쓰기/깨진 raw 백업 · 16-slot imageSource/consumer 전수·filename→key · unknown/중복/dimension 불일치/required MANIFEST null 거부 · AUTHORING_ONLY runtime binding 0 · VIEW_MODEL art preview 오염 0 · 승인 manifest runtime 도달 |
| T-3 | `tests/ui/deskLayout.test.ts` | 승인 `fg-desk` resolved rect `{0,239.5,640,160.5}`·rotation/aspect/layer · RuntimeAssetLayout에서 파생한 `DESK_TOP/TAG_ROW_Y` · ×2 결과 1280×321 · 책상 하단 400 · judgment lane/고정 sub-container z-order/async load 순서 불변 |
| T-4 | `tests/schema/noncombat-events.test.ts` | runEvent→cutscene→case 무순환 · D/E/F/컷씬 왕복 · BEFORE/AFTER 최대 1개·ID/timing 유일성·기존 이벤트 기본 `[]` · 참조/분기 도달성 · A 이탈/D fallback/skippable default path의 음의 stress/`UPGRADE_EVIDENCE`/미분류 partial effect 거부 · attempt_limit 상한 · 별도 `sets_flags` 거부 · D option costs/effects + flag `selection` · 공용 primitive FlagValue/object·null 거부 · `RunEffectSchema` 미지원 payload/런 외 자원 거부 |
| T-5 | `tests/engine/run-event-patterns.test.ts`, `tests/app/effective-card-tuning.test.ts` | D definition tuning 누적·before/after 구조 기반 eligible·CP=0 no-op/부분 clamp/overflow pair 제외·pair0 total FALLBACK·항상 DECLINE·F-12 selection·모든 copy 동일·resource당 1 normalized effect/1 clamp·requested vs realized summary/playability/effect 일치 / E 조기 종료·재탐문 차단 / F 중복 방어·등급 보존 · 모든 패턴 원자 적용 |
| T-6 | `tests/engine/run-effects.test.ts` | 5종 run effect · SET_FLAG primitive 전수/composite 사전 거부 · fractional finite resource/overflow·NaN 거부/0-stress/상·하한/clamp/no-dead-loop · `nextAuthoredGrade`/F reachability · `OPEN_ROUTE` incompatible 보존/compatible 주입/성공 시 주입분만 제거/FAILED·save 실패 보존/orphan 거부 · unknown type 사전 throw |
| T-7 | `tests/app/event-transaction.test.ts` | A~F draft 전수·pattern mismatch/위조 cutscene path/중복·초과 selection/자원 부족 거부 · BEFORE→event→AFTER→hook/projected 일치 · save 1회 · B preview 무커밋 · D TUNE/FALLBACK/DECLINE 적법성 · reload 원상복귀 · 저장 실패 재시도 중복 0 |
| T-8 | `tests/ui/cutscene-overlay.test.ts` | engine/UI treatment catalogue 집합 일치·app exhaustive projection · fixed cutscene asset rect/manifest 비적용 · required callback/branch 사전검증 · 4-choice safe rect · 자동 비트 · choice 중 ticker/watchdog 정지·input trap · destroy/cancel 완료 0 · manual resolve→draft→overlay 원자 순서 · total default path skip 선검증+`onSkipChoices` 단일 staging/중간 예외 draft 0 · playbackState · update/choice 예외 전달 |
| T-9 | `tests/app/dead-scene-presentation.test.ts`, `tests/ui/dead-scene.test.ts` | 현행 9개 `OutcomeReason`의 명시적 FAILED 정규화 · success reason 오조합 invariant · 신규 reason 컴파일 누락 방지 · 테이블 5종/FADE_OUT preset 거부 · treatment 종료 root alpha=1+buttons hit-test · app raw-key 없는 view · UI app/engine import 0 · 자동 진행 없음 · 3구간 asset key |
| T-10 | `tests/app/dead-scene-flow.test.ts` | FAILED가 dead scene 전 save/history 0 · RETRY 뒤 snapshot/save byte 동일·같은 seed · action IDLE→PENDING→COMMITTED/DESTROYED와 reject→IDLE · pending double-click/교차 action 0 · reject 뒤 기술 retry 단일 persist · TERMINATE만 FAILED 1회 · stress=0 terminal save/reload · reload는 현 노드 재진입 |
| T-11 | `tests/content-io/save-migration.test.ts`, `tests/app/run-contract-fingerprint.test.ts`, `tests/app/stale-save-bootstrap.test.ts` | snake↔camel v2 필드/중복·범위 검증 · nonterminal stress>0 vs terminal FAILED stress>=0/stress=0 round-trip · fingerprint stable SHA-256와 run-rules/strip/case/common gameplay 변화 감지 · production builder가 `RUN_RULES_CONTRACT_VERSION`을 실제 projection에 넣는지 + 동일 fixture에서 version만 `N→N+1`로 바꾸면 hash가 반드시 달라지는 sentinel · 대표 reducer 결과 fixture 변경 시 규칙 bump yes/no 명시 · full canonical envelope deep-equal pristine v1만 null resume · ignored legacy gameplay field 변조 거부 · 진행/변조 v1 `StaleRunContractError`/raw bytes 보존·명시적 새 런 전 clear 0 · no-run import만 가능 · 미래 버전 거부 |
| T-12 | `tests/dev/autoplay-event-cutscene.test.ts` | L1/L2 D/E/F와 CUTSCENE structured full action token(node/event/generation/beat/phase/revision)·delimiter/local ID 재사용·retry/stale generation·mode별 advance/skip · 자동 beat마다 새 문자열 scan · DEAD_SCENE action/report · §2.3.1 판정 배너의 action 전 queue scan→report evidence→ack, preview-before-submit, RESOLUTION-before-next-action, `previewNotApplicable` 엄격 의미, 모든 신규 ephemeral `displayStrings`와 raw key 0 · runtime report의 exact node/ref/eventPattern join+`A~F` histogram · D priority→F-12 · 15노드/9 encounter report 불변 · canonical best/worst-nonskip video+dwell critical-path budget |

### 5.2 수정이 필요한 기존 테스트

| 파일:라인 | 사유 |
|---|---|
| `assetDimensions.test.ts` desk aspect case | `desk_foreground` 비율이 1280×321로 바뀌어 `{640,118}` 단언이 무효 |
| `assetDimensions.test.ts` canonical slot loop | `fg-desk` 기대 rect를 640×160.5로 바꾸되 전 슬롯 비율 일치 불변식은 유지 |
| `tests/ui/game-flow-screens.test.ts` | 이벤트 화면 모델에 D/E/F 케이스 추가로 exhaustive switch 확장 |
| `tests/app/run-session.test.ts` | `RunState` 신규 event 필드와 persist-first 원자성 픽스처 갱신; 기존 FAILED terminal 의미는 유지 |
| `tests/app/autoplay-port.test.ts`, `tests/dev/autoplay-*.test.ts` | EVENT D/E/F · CUTSCENE · DEAD_SCENE 판별 유니온과 문자열 수집/driver switch 확장 |
| `tests/e2e/full-run.headless.test.ts` | A/B/else(C) 분기를 exhaustive D/E/F로 확장; 정상 15노드에서 outcomeHistory 9건 불변 |
| `tests/content-io/save.test.ts` | 새 run 필드의 known-ID/현재-node 의미 검증과 v1→v2 직렬화 기대값 갱신 |
| `tests/audio/sound-registry.test.ts` 및 asset-registry 회귀 | stinger 고정 2종 기대를 7종 catalogue 전수로 갱신하고 5개 OGG 실제 발견, dead PNG 5개의 3구간 key/원본 치수를 검증 |

### 5.3 콘텐츠 작업 동반 항목

| 항목 | 규모 |
|---|---|
| `strings.ko.json` 신규 키 | 데드씬 사유 10키(5×title/cause) + 공용 action 2키 + summary label/format 키 + D/E/F 라벨/설명 + 컷씬 대사. **현재 기준선 322키**, 최종 수는 coverage test가 결정하며 고정 개수로 누락을 숨기지 않음 |
| `assets/dead/` 일러스트 | 5종 (`과로`·`징계`·`시한`·`미제`·`절차`), `dead_<name>_base.png` → `dead/<name>/base` 명명 |
| `assets/bgm/` 스팅어 | 5종 (`sting_collapse`·`sting_gavel`·`sting_clock`·`sting_file_close`·`sting_procedural`) — 릴리스 필수 |
| `전경_책상_기본.png` | 1280×321 재저작 |
| `assets/manifests/asset_manifest.json` | v3 승인본 체크인 + app runtime loader 입력 + JSON Schema/export 검증. 워크벤치 다운로드만 존재하면 미배선 |
| D/E/F 이벤트 저작 | 15노드 계약을 깨는 신규 노드 추가 없이 **기존 EVENT 6노드를 아래 표의 A~F 각 1개로 교체**한다. `node_id/ref`는 유지하고 case event의 pattern/payload를 갱신한다. `run-strip.schema_version`과 영향 case `content_version`을 올린다 |

canonical 매핑은 구현자가 임의로 재배치하지 않는다. F는 ep001 boss 직전의 증거 확보, E는 ep004 중간의 다음
compatible encounter route/hint, D는 최종 boss 직전의 카드 강화로 소비 시점을 보장한다.

| strip 위치 | `node_id` | `ref` | target pattern |
|---:|---|---|:---:|
| 2 | `run_tutorial_02` | `event_tutorial_choice` | A |
| 4 | `run_tutorial_04` | `event_tutorial_placement` | B |
| 7 | `run_ep001_02` | `event_ep001_links` | C |
| 9 | `run_ep001_04` | `event_ep001_warehouse` | F |
| 12 | `run_ep004_02` | `event_ep004_machine_room` | E |
| 14 | `run_ep004_04` | `event_ep004_ticket_trade` | D |

위 마지막 행은 단순 discriminator 교체가 아니다. §1.4.1의 두 `choice_* → option_*` rename, option별 기존 cost/evidence
effect와 `autoplay_priority:0/100` 보존, D tuning 저작, common/case-local F-12 `selection` hook 동시 변경,
현 `policy.ts`의 삭제될 choice-ID 하드코딩 제거, 삭제 ID 고아 참조 0까지 한 changeset으로
적용한다. 이 migration을 하지 않은 A→D 콘텐츠는 schema/flag semantic gate에서 반드시 실패해야 한다.

`tools/validate`의 bundle semantic 단계는 run strip과 모든 case를 join해 각 EVENT ref가 정확히 하나의 event로
해석되는지, 위 `node_id/ref/pattern` 매핑과 pattern histogram `{A:1,B:1,C:1,D:1,E:1,F:1}`, 전체 15노드/9
encounter를 검증한다. case-local validator만으로 이 전역 계약을 증명했다고 보고하지 않는다.

### 5.4 합격 기준

먼저 `package.json`의 Node `>=22.13 <23`와 pnpm `11.18.0`을 만족시킨다. 호스트 기본 Node 24의 engine
warning 상태를 합격 증거로 쓰지 않는다.

```bash
cd dungeon-dossier
corepack pnpm typecheck      # tsc --noEmit ×2 프로젝트
corepack pnpm lint           # eslint --max-warnings 0
corepack pnpm arch           # dependency-cruiser 계층 규칙
corepack pnpm test           # vitest 전량 그린
corepack pnpm content:validate
corepack pnpm palette:check
corepack pnpm schema:export # checked JSON Schema byte 동기화
corepack pnpm simulate:full  # routes + flags + replay
corepack pnpm build          # dev 트리셰이킹 sentinel 포함
corepack pnpm check          # 저장소가 정의한 통합 게이트도 별도 확인
```

추가 확인:
- `?autoplay=true&mode=turbo`와 `mode=video` 15노드 완주가 **여전히 PASS**. D/E/F와 choice 컷씬은 포트/driver가 직접 행동하고 stall 0이어야 한다.
- generic schema의 컷씬 상한(2×64 beat×20초)을 canonical video에 그대로 허용하지 않는다. `default_choice_id`는 skip
  전용이므로 video 추정 경로로 오용하지 않는다. bundle validator는 (a) 모든 reachable **non-skip** cutscene branch의
  worst-case와 (b) driver와 같은 공용 selector/seed가 고른 canonical BEST-policy path를 각각 계산한다. authored beat
  duration, localized typewriter, preview-before-submit/queue-ack cadence, D/E/F action 수, direction time scale,
  encounter-terminal judgment feedback dwell과 15-node gate를 포함하며, gate는 각 node에서
  `elapsed = max(elapsed, videoNodeGateMs(nodeIndex, 150))`로 합성해 중복 가산하지 않는다. 두 결과가 모두
  `estimateVideoCriticalPath()`의 **145,000ms content budget**을 넘지 않아야 하고, BEST 선택 ID/action 수는 실제 driver
  trace와 byte-for-byte 일치해야 한다. 나머지 5초는
  asset decode/render/report overhead 예산이며 정적 추정은 실측
  브라우저 gate를 대체하지 않는다.
- dev server가 실제로 배정한 URL에서 1280×800 브라우저로
  `/?autoplay=true&mode=video&policy=best&seed=20260805`를 실행한다. 정적 duration/gate 테스트가 아니라
  report의 실측 `durationMs`가 **target 135,000~150,000ms**에 들고, 15개 canonical node,
  `RUN_COMPLETED`, expected ending, console/missing asset/raw i18n/invariant failure 0인지 확인하며 엔딩 screenshot을 남긴다.
  현 코드의 `VIDEO_DURATION_ACCEPTANCE` 135,000~165,000ms는 기준선일 뿐 “150초 이내”를 증명하지 않으므로 target에서
  `minimumDurationMs:135_000`, `maximumDurationMs:165_000`을 유지한다 (VIDEO-P0-06에서 목표 150초 ±15초로 확정; 상한을 150_000으로 조이는 안은 채택하지 않음). `actionDelayMs:950`, `runTimeoutMs:360_000`은
  그대로 유지하며 timeout은 안전장치이지 duration 합격 상한이 아니다. 코드·테스트·브라우저 report가 바뀌기 전에는
  이 항목을 완료로 표시하지 않는다.
- [자매 카드/워크벤치 설계](./card_contradiction_workbench_design.md) §2.3.1의 `AUTO-FEEDBACK-02`를 닫아 제출 후
  judgment banner와 preview 문자열이 갱신된 scene `displayStrings`와 monotonic queue 양쪽에 들어가야 한다. 각 item은
  다음 action 전에 report evidence 기록→raw-key scan→ack 순서를 지켜야 하고, 법적 preview 후보 0건 외의 실패를
  `previewNotApplicable`로 기록하면 안 된다. 그 전의 raw-i18n failure 0은 ephemeral 판정 피드백을 검사하지 않은 거짓 음성이다.
- 실패 강제 시 DEAD_SCENE scene이 노출되고, RETRY 테스트에서 run snapshot/history/save가 동일하며 TERMINATE 테스트에서 FAILED가 1건만 생기는지 확인한다.
- 워크벤치에서 `fg-desk`가 1280×321 PNG를 받아 **640×160.5**로 배치·재로드되고, v3 manifest 승인본을 인게임이 실제 소비해 HD 1280×321로 렌더하는지 확인한다.

---

## 부록 A. 구현 순서 (의존 관계 기준)

| 단계 | 내용 | 선행 | 비고 |
|---|---|---|---|
| 1 | S-1/S-2/S-11 transform + manifest/workbench v4 migration + runtime consumer + T-1/T-2 | — | export-only 상태를 끝내고 기존 렌더 무변경 잠금 |
| 2 | S-3 책상 160.5 logical + §2.6 앵커링 + T-3 | 1 | 0.5 기하 왕복이 먼저 성립해야 함 |
| 3 | 워크벤치 인스펙터 W/H/비율유지 UI | 1 | 자매 문서의 character/sidecar 변경과 같은 v4 state로 합침 |
| 4 | S-5/S-6 컷씬 스키마 + sequence host + semantic validator + T-8 | — | 기존 fixed-duration host를 무수정 재사용하지 않음 |
| 5 | S-4/S-10 D/E/F + strict run cost/effect + exhaustive reducer + T-4/T-6 | — | 병렬 가능 |
| 6 | S-7/S-8 `RunState`·save v2·run-contract fingerprint·semantic catalog + T-5/T-11 | 5 | 진행된 v1을 빈 신규 상태로 무음 복원 금지 |
| 7 | EventDraft 1회 커밋 + D/E/F 화면 + A/C 정리 + T-7 | 4,5,6 | AFTER도 commit 이전 |
| 8 | S-9 app projection + dead scene + pre-commit RETRY/TERMINATE + T-9/T-10 | 4 | save schema에 retry 필드 추가 없음 |
| 9 | AutoplayPort/driver/L1/report의 A~F+CUTSCENE phase/revision+DEAD attempt 확장 + T-12 | 7,8 | 15노드/9 encounter history 불변 |
| 10 | 콘텐츠 저작 (문자열·5 일러·5 스팅어·고정 매핑 A~F 각 1 EVENT) + bundle join/budget validator | 7,8,9 | strip/case version bump 포함 |

**1·4·5는 서로 독립이므로 3인 병렬 착수가 가능하다.**

## 부록 B. 이 설계가 함께 해소하는 기존 감사 지적

| 감사 ID | 지적 | 본 설계의 해소 |
|---|---|---|
| C-3 / CNT-16 | 이벤트 선택지 비용·획득 미렌더 지적 | 현재 A 구현의 표시를 회귀 잠금하고 §3.5에서 D/E/F까지 공용화 |
| UI-E3 | 자원 부족 선택지 클릭 시 무반응 | §3.5 |
| P-9 | 패턴 C에 결과 피드백·중단 수단 없음 | §3.3 E와 컴포넌트 공유 |
| C-5 / CNT-02 | 이벤트 증거 보상이 전부 기획득이라 실질 0 | §3.3 F의 중복 방어 |
| R-6 | 전투 1회 FAILED로 런 전체 즉시 종료 | §4.4 재시도 정책 |
| P-7 / RUN-05 | 강제자백·실패 시 등급이 화면에 한 번도 안 나옴 | §4.3 데드씬 런 요약 |
| — | `applyRunEffects`의 조용한 `continue`가 기능을 죽임 | §3.4 strict `RunEffectSchema` + exhaustive throw |
