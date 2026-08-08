# 🏗️ 던전 수사 조서 — 카드 효과·모순 텍스트·강압 연출·워크벤치 파츠·초상 셰이크 구현 설계서

| 항목 | 내용 |
|---|---|
| 문서 ID | `docs/design/card_contradiction_workbench_design.md` |
| 버전 | v1.3 최후 전수감사·무결성 보강판 (2026-08-07) |
| 대상 코드베이스 | `dungeon-dossier/` — **2026-08-07 현재 작업 트리 실측. 미커밋 구현이 포함되어 있으므로 아래 파일명·심볼을 기준으로 삼고 line number는 참고값으로만 사용한다.** |
| 선행 규격 | `docs/phase/prompt_card_evidence_workbench_feature_design.md` (5대 기능 요구 명세) |
| 전체 검증 게이트 | `cd dungeon-dossier` 후 `corepack pnpm check` (`lint` · `arch` · `typecheck` · `test` · `content:validate` · `palette:check` · `simulate:smoke` · `build`) + 확장 게이트 `corepack pnpm schema:export` · `corepack pnpm simulate:full` |

---

## 2026-08-07 구현 대조 감사 결론

상태 표기는 다음과 같다: **완료**는 구현과 자동화 근거가 모두 존재함, **부분 완료**는 구현은 있으나 아래 수용 기준 일부가 미충족임, **미구현**은 설계만 존재함을 뜻한다. 이 표와 각 절의 `현재 상태`가 과거형/미래형 설명보다 우선한다.

| 기능 | 현재 상태 | 구현 근거 | 자동화 근거 | 닫히지 않은 조건 |
|---|---|---|---|---|
| F1 카드 효과 배선 | **완료** | `src/engine/encounter/EncounterCoordinator.ts`의 `#applyCardEffects`·`#bindSubmissionTargets`·`#applyEncounterEffect`, `content/common/cards.json` | `tests/judgment/card-effects.test.ts` | 설명 문구와 구조화 수치의 일치 자체는 테스트하지 않음 |
| F1 카드 3분할 | **부분 완료** | `cardLayout.ts`의 `CARD_COPY_RECTS`, `cardArtwork.ts` | `tests/ui/card-artwork.test.ts` | raw intent token 노출/CROSS_CHECK presentation 누락, 실제 14종 한국어 문구 overflow와 1280×800 픽셀 렌더 미검증; 아트는 카드별이 아니라 의도별 3종 재사용 |
| F2 판정 피드백 | **부분 완료** | `JudgmentUiMapRepository.ts`, `judgmentFeedback.ts`, `judgmentBanner.ts`, `bootstrap.ts` | repository/app/banner/UI 조립 단위 테스트 | 제출 전 프리뷰는 구현됐으나 선택 해제 시 stale banner clear가 없음; 제출 후/프리뷰 문자열이 autoplay `displayStrings`에 들어가지 않음 |
| F3 강압 상승 연출 | **부분 완료** | `punishJuice.ts`, `shake.ts`, `createInterrogationScreen.ts`, `bootstrap.ts` | `punish-juice.test.ts`, `interrogation-screen-juice.test.ts` | 실제 순증가만 전달하는 코드는 구현됨; `강압` 레이블 i18n 주입과 +15/+5/상쇄/포화의 bootstrap 회귀가 없음 |
| F4 캐릭터별 워크벤치 | **부분 완료** | workbench v3 상태·패널·가져오기/내보내기 | `tests/ui/workbench-character-parts.test.ts` | 캐릭터 offset과 스테이지 preview가 분리됨; legacy offset 편집기가 병존; layer ↑/↓ 없음; `used`·캐릭터별 transform/layer는 v2 sidecar 범위 밖이며, 승인 sidecar를 소비하는 인게임 런타임도 없음 |
| F5 초상 전환 셰이크 | **부분 완료** | `portrait.ts`, `suspectTransition.ts`, 화면/부트스트랩 배선 | `portrait-shake.test.ts`, `suspect-transition.test.ts`, 화면 통합 단위 테스트 | 현 upset은 400ms/peak 9px로 `≤10px` 계약을 충족하지만 lose가 550ms/peak 11px이며, detector가 reverse/skip edge까지 발화함. bootstrap 직접 테스트와 브라우저 검증도 없음 |

### 감사에서 확인한 우선 잔여 항목과 수용 기준

| ID | 우선순위 | 발견사항 | 완료 수용 기준 |
|---|---:|---|---|
| `WB-OFFSET-01` | P0 | 캐릭터 패널은 `characters[character].offsets`를 바꾸지만 스테이지는 공용 `geometry`만 렌더한다. `index.html`의 “선택한 캐릭터가 스테이지 … 그대로 반영” 문구와 불일치한다. | active character 변경 및 base/upset/lose/used transform 변경 직후 스테이지 overlay가 단일 character transform 원천과 일치한다. authored offset은 source-pixel 단위로 손실 없이 저장·복원하고, preview/runtime은 동일한 slot-scale 투영과 0.5 logical render-grid snap을 사용하며 캐릭터 전환 왕복 후 값이 보존된다 |
| `WB-SOURCE-02` | P0 | 신규 CHARACTER PARTS와 기존 SUSPECT STATE PARTS가 서로 다른 offset 원천을 편집·내보내므로 같은 캐릭터에 상충하는 JSON을 만들 수 있다. | legacy state-slot transform/locks를 character affine으로 한 번 소비한 뒤 frozen canonical sample로 만들고 global gizmo/preview/runtime/user-state export에서 제외한다. 화면 preview·character sidecar·runtime은 materialized character part 한 원천만 사용 |
| `WB-LAYER-03` | P1 | 설계의 `[↑][↓]`는 미구현이며 현재 `SlotDefinition.layer`는 고정 상수다. | 공동 workbench v4와 portrait sidecar 3.0에 영속 character-part layer를 포함하고 UI 조작·동률 시 안정적인 z-order·v3 migration/sidecar round-trip 테스트 추가 |
| `WB-SIDECAR-04` | P1 | 가져오기는 `schema_version`과 배열 여부만 검사한다. `slot/origin/state/width/height`, 중복 state, 파일이 가리키는 캐릭터 불일치가 검증되지 않는다. | v4가 모든 character base/upset/lose(+김_인턴 used) state를 image와 무관하게 materialize하고, portrait sidecar 3.0이 required image·식별자·offset/rotation/shear/scale/layer를 왕복하며 canonical v2 12개 migration 및 malformed/중복/캐릭터 불일치 거부 테스트 통과 |
| `WB-RUNTIME-05` | P0 | 현재 게임은 PNG registry key와 동일 rect overlay만 사용하며 `portrait_*.state-parts.json`을 parse/주입하지 않는다. 지금 워크벤치에서 조정한 offset/rotation/shear/scale/layer는 인게임에 반영되지 않는다. | 승인된 sidecar v3를 단일 schema/repository로 검증하고 app이 UI-local portrait part DTO를 주입한다. workbench preview와 `portrait.ts`가 동일 full-affine transform resolver/layer tie-break를 쓰며 localStorage를 런타임이 직접 읽지 않는 통합 테스트 통과 |
| `I18N-JUICE-01` | P1 | `punishJuice.ts`의 기본 `${delta} 강압`은 `strings.ko.json`의 `resource.coercion`을 소비하지 않는다. | app/presentation이 로컬라이즈한 `resourceLabel`을 주입하고 UI 코드에 신규 사용자 노출 한국어 literal이 없음을 테스트 |
| `I18N-MODAL-02` | P1 | `cardDetailModal.ts`가 `카드 밖을 클릭하면 닫힙니다`를 UI 계층에 하드코딩한다. 한국어로 보이지만 locale catalogue/coverage/교체 경계를 우회한다. | `card.modal.dismiss_hint`를 strings에 추가하고 app/screen model이 완성 `dismissHint`를 주입한다. modal 단위 테스트는 raw key와 하드코딩 literal 없이 전달 문자열을 렌더하는지 검증 |
| `AUTO-FEEDBACK-02` | P1 | `collectAutoplaySceneStrings(screenModel)` 호출 뒤 imperative controller에 배너를 주입하므로 ephemeral feedback은 L2 raw-key 스캔 대상이 아니다. | 피드백을 screen model에 포함해 scene 생성 전에 수집하거나 명시적 telemetry/AutoplayScene 갱신으로 전달하고, 제출 후 문자열과 raw-key 부재를 L2에서 검증 |
| `PREVIEW-CLEAR-03` | P1 | preview가 한 번 보인 뒤 `card/facet` 해제, evidence 0개, 비대상 intent 전환, rule 없음 경로에서 `previewSelection()`이 그냥 return하여 이전 배너가 남는다. | selection change 시작 시 preview 소유 배너를 clear하고, 유효 CONFIRM/CONTRADICT+docked evidence일 때만 다시 show하는 bootstrap/UI 회귀 통과 |
| `COERCION-DELTA-04` | P1 | bootstrap은 이미 판정 후 gauge의 실제 순변화만 전달하도록 수정됐으나, 이 정책을 제출 경계에서 직접 잠그는 자동화가 없다. | `max(0, after.coercion-before.coercion)` 정책을 유지하고 정상 +15, cap 직전 실제 +5, 상쇄/포화/0/음수는 연출 0임을 bootstrap 수준에서 고정 |
| `APP-WIRING-05` | P1 | 순수 조립기/컨트롤러 테스트는 있으나 실제 `onSubmit` 리마운트 후 새 컨트롤러에 배너·강압·초상 전환을 호출하는 테스트가 없다. | 비종료/종료 제출 각각에서 호출 순서와 인자를 검증하고, 첫 마운트·인카운터 변경 시 셰이크가 없음을 단언 |
| `CARD-VISUAL-06` | P2 | 14종 실문구가 고정 4줄 안에 들어가는지와 실제 Galmuri/Pixi 렌더는 검증하지 않는다. | 모든 카드의 로컬라이즈된 title/description을 대상으로 overflow 없음 검증 + 1280×800 브라우저 스냅샷에서 팬/모달 판독성 확인 |
| `PORTRAIT-AMP-07` | P1 | 현 upset은 400ms/계수 10/관측 peak 9px로 `maxAbs≤10px` 계약을 이미 충족한다. 실제 위반은 lose의 550ms/계수 12/관측 peak 11px과 모든 unequal edge를 발화하는 detector다. | 허용 edge를 base→upset/upset→lose 두 개로 제한하고 둘 다 400ms, `maxAbs≤10px`로 고정한다. reverse/skip edge는 무연출이며 exact peak 10은 요구하지 않는다. 1ms 전수 순수 함수·실제 ticker 복원·edge table 테스트 통과; lose 강화는 화면 shake/pixel-wave에만 둠 |
| `INTENT-I18N-08` | P1 | 카드가 `QUERY` 같은 개발자 intent token을 그대로 표시하고 intent→일러/색 role 매핑도 스키마의 `CROSS_CHECK`를 전수 처리하지 않는다. autoplay visible-field allowlist에도 `intentLabel`이 없다. | app이 `ACTION_INTENTS` 전수 label key+visual role+art definition을 localized `intentLabel`+role+art output으로 투영하고 UI에는 완성 문자열만 전달한다. `CROSS_CHECK` 포함 누락 시 type/test가 실패하며 `autoplayPort.ts`가 `intentLabel`을 `displayStrings`에 수집 |
| `BANNER-LIFECYCLE-09` | P1 | preview와 제출 결과가 같은 imperative banner를 소유하고 terminal 제출 직후 화면 전환이 시작돼 결과가 한 프레임도 보이지 않을 수 있다. | app-owned `PREVIEW`/`RESOLUTION` 소유권과 selection-edit dispatcher를 고정한다. terminal dwell은 foreground ticker를 우선하되 monotonic wall-clock watchdog으로 무한 대기를 막고 no-render degraded continuation을 telemetry에 기록하며, autoplay도 동일 상태를 관측 |
| `PREVIEW-SEMANTICS-10` | P1 | 현 preview는 required scope 포함 여부만 보면서 모두 덮으면 SUPPORT 색을 사용한다. confidence/source count/integrity/관계 판정 전인데 성공처럼 읽힐 수 있다. | preview는 별도 중립 tone과 “범위 충족 여부만 확인·최종 판정 전” 문구를 사용하고 SUPPORT/CONTRADICTION은 제출된 resolution에만 사용 |

---

## 0. 실측 기준선 — "이미 있는 것"과 "만들 것"의 경계

> **⚠️ 이 절이 본 설계서의 핵심이다.** 요구 명세가 지목한 파일 중 상당수는 **이미 존재하며 부분 구현돼 있다.**
> 이를 무시하고 새로 만들면 이중 구현이 된다. 각 기능은 반드시 아래 실측 위에 증축한다.

### 0.1 이미 존재하는 자산 (증축 대상)

| 영역 | 실측 사실 | 근거 |
|---|---|---|
| 카드 스키마 | `cost: CostSchema`(=`cp` 포함) · `modifiers: Effect[]` · `special_effect_id?` · `card_modifier?(stamp/postit/clip)` · `chain?` **전부 이미 스키마에 존재.** 카드 14종 고정(`cards.length(14)`) | `src/engine/domain/schemas/cards.ts#CardSchema` |
| 카드 뷰모델 | `InterrogationCardView = { cardId, title, description, intent, cpCost, requiresEvidence, artAssetKey?, attachments? }` — **cpCost·설명 이미 노출** | `src/ui/screens/interrogation/model.ts#InterrogationCardView` |
| 카드 위젯군 | `cardFan.ts`(부채꼴 손패 + 드래그 + 점선 링크) · `cardDetailModal.ts`(전체 확대 모달) · `cardArtwork.ts`(5레이어 합성 + CP 텍스트) · `cardLayers.ts`(base/illust/stamp/post/evidence z순서) · `cardLayout.ts`(저작 좌표계 640×725, 팬 스케일 0.2) **전부 존재** | `src/ui/widgets/` |
| 점선 연출 | `dottedLink.ts` — 카드→태그 드래그 시 시안색 곡선 점선(`curve: -28`) 이미 렌더링 | `src/ui/widgets/cardFan.ts#createDottedLink` 호출부 |
| 게이지 | `gauge.ts` — `createGauge(value, max, {label, fill, sweetSpot…})` 셀형 게이지 + `coercionWarningSlipCount()`. 심문 HUD에 평정·강압 게이지와 `아이콘/평정심/기본`·`아이콘/강압/기본` 32×32 아이콘 **이미 배치됨** | `src/ui/widgets/gauge.ts#createGauge`, `createInterrogationScreen.ts#addHud` |
| 판정 UI 맵 | `content/common/judgment-ui-map.json` — 증거 판정코드 5종, 스코프 11종, facet 6종. **런타임 로더와 app 조립기가 구현됨.** 맵에 없는 나머지 엔진 판정코드는 tone별 폴백 문자열을 사용한다. | `src/content-io/JudgmentUiMapRepository.ts`, `src/app/judgmentFeedback.ts`, `tests/content-io/judgment-ui-map-repository.test.ts` |
| 판정 산출물 | `Resolution = { code, reason?, axes(relevance/relation/sufficiency/…), feedback?(coveredScopes/missingScopes), effects(coercionDelta/composureDelta…), reactionKey }` — **모순 설명에 필요한 데이터가 엔진에서 전부 나온다.** `SubmissionResult.missingScopes`로 UI까지 전달됨 | `src/engine/resolution/types.ts#Resolution`, `EncounterCoordinator#submit` |
| 강압 수치 | `balance.json` — `coercion: { insufficient: 2, truthAttack: 15, irrelevant: 5, … }`. 명세의 "+15 강압도" 예시는 `truthAttack` 값과 정확히 일치 | `content/common/balance.json` |
| 초상 위젯 | `createPortrait(): PortraitController`로 승격되어 state 파츠·틴트 폴백과 티커 기반 transition shake를 제공한다. 파트너 컨트롤러도 base/used·쿨다운을 유지한다. | `src/ui/widgets/portrait.ts`, `tests/ui/portrait-widget.test.ts`, `tests/ui/portrait-shake.test.ts` |
| 상태 파츠 규칙 | `evaluateSuspectState`: `composureRatio ≤ 0.4 → upset`, `confessed ∨ composure ≤ 0 → lose`(lose가 upset에 우선) | `src/engine/suspectState.ts#evaluateSuspectState` |
| 워크벤치 | 고정 16 stage 슬롯은 유지하면서 문서 `version: 3`에 12캐릭터별 images/offsets와 active character를 추가했다. 저장 키는 호환을 위해 `dungeon-dossier.asset-workbench.v2`를 유지하며 v2→v3 마이그레이션한다. 신규 character sidecar와 legacy `portrait_용의자.state-parts.json` 내보내기가 **동시에 존재**한다. | `workbench/model.mts`, `workbench/main.mts`, `tests/ui/workbench-character-parts.test.ts` |
| 파츠 사이드카 | `assets/portraits/portrait_<이름>.state-parts.json` ×12 — `schema_version 2.0, base{slot,image,512²}, state_parts[{state:upset|lose, origin, x,y,w,h}]`. **12캐릭터 = 고블린·김_인턴·김태훈·드워프·물컹이·미노타우로스·사이클롭스·서큐버스·오크·켄타우로스·타락한_용사·하피** | `assets/portraits/` 실측 |
| 저작 치수 | `ASSET_DIMENSIONS`: `card_base 640×725` · `card_illust 256×256` · `suspect_base/state_parts 512×512` · `icon_coercion 32×32` — **명세의 256×256 일러스트·32×32 아이콘 치수와 이미 일치** | `src/ui/core/assetDimensions.ts` |
| 화면 갱신 모델 | 심문 화면은 매 제출 후 전체 리마운트된다. `detectSuspectTransition()`이 이전/현재 encounter+part를 비교하고 bootstrap이 새 컨트롤러에 transition을 재생한다. 판정 배너·강압 연출도 같은 리마운트 직후 재주입된다. | `src/app/bootstrap.ts`, `src/app/suspectTransition.ts` |
| i18n | `t(key, fallback)` + `strings.ko.json` 현재 322키. 카드명·설명과 판정 피드백은 app 계층에서 로컬라이즈된다. 단, 강압 플로팅 레이블과 카드 모달 닫기 힌트는 아직 UI literal이다(`I18N-JUICE-01`, `I18N-MODAL-02`). | `src/app/i18n.ts`, `src/app/createEncounterSession.ts`, `src/app/judgmentFeedback.ts`, `punishJuice.ts`, `cardDetailModal.ts` |

### 0.2 아키텍처 불변 조건 (전 기능 공통)

1. **`src/ui/**` → `src/engine/**` import 금지** (`tests/arch/layer-imports.test.ts`). 엔진 데이터가 UI에 필요하면 **app 계층(bootstrap/presentation)이 뷰모델로 투영**해서 넘긴다.
2. **프로덕션 번들에 `src/dev/**` 유입 금지** (`vite.config.ts` 트리셰이킹 게이트). 본 5개 기능은 전부 게임 기능이므로 dev 계층이 아니라 ui/app/engine에 배치한다.
3. 화면 좌표계는 **640×400 logical stage**이며 viewport가 정수 2×로 1280×800에 출력된다. 따라서 **1 logical unit = 최종 renderer 2px**이고 render-grid는 0.5 logical이다. 이것을 모든 source PNG의 1px가 곧 0.5 logical이라는 뜻으로 해석하면 안 된다. source-pixel→stage 변환은 실제 slot 배율(예: 512px 초상→216 logical이면 `216/512`)을 사용하고, 마지막 렌더 위치만 0.5 grid에 snap한다. 현재 셰이크의 정수 logical offset은 해당 효과의 의도적 곡선 계약이다.
4. 신규 사용자 노출 문자열은 **모두 `strings.ko.json` 키**로 저작하고 `tests/content/strings-coverage.test.ts` 및 기능별 조립 테스트를 통과해야 한다. 현재 `punishJuice.ts`의 `강압` 폴백과 `cardDetailModal.ts` 닫기 힌트는 알려진 예외다(`I18N-JUICE-01`, `I18N-MODAL-02`).
5. 오토플레이(L2)와의 공존: 모든 신규 연출은 **씬 전환을 만들지 않는 티커 기반 오버레이**여야 한다(드라이버 워치독은 씬 정체·DIRECTION만 감시하므로 인터랙션을 막지 않는 연출은 안전).

---

## 1. 기능 1 — 카드 효과·CP 코스트·3분할 레이아웃

> **현재 상태: 효과 배선 완료 / 3분할 부분 완료.** 아래 설계는 구현되었으며, 남은 범위는 실제 콘텐츠 overflow·픽셀 렌더와 카드별 아트 계약이다.

### 1.1 Architecture & Schema Changes

**스키마 변경: 없음(0건).** `cost.cp`·`modifiers: Effect[]`·`special_effect_id`가 이미 존재한다(§0.1). 명세의 "효과 4종"은 기존 `EffectSchema` 어휘로 전부 표현된다:

| 명세 효과 | 기존 Effect 표현 | 비고 |
|---|---|---|
| 평정심 깎기 | `{ type: 'ADJUST_RESOURCE', resource: 'composure', delta: -N }` | |
| 증거 탐색 | `{ type: 'GRANT_EVIDENCE', target: 'ev_…' }` 또는 `{ type: 'REVEAL_CLAIMS', … }` | |
| 진술 고정 | `{ type: 'SET_CLAIM_STATE', value: 'COMMITTED' }` | `enh_clip_commit`과 동일 어휘 |
| 강압도 감소 | `{ type: 'ADJUST_RESOURCE', resource: 'coercion', delta: -N }` | 숨 고르기 계열 |

**스키마 변경 없이 ① 런타임 소비 ② 콘텐츠 저작 ③ 레이아웃 조정이 구현되었다.**

**1.1.1 카드 효과 런타임 배선 검증·완결 (감사 E-3 잔여)**

- 실제 제출 경로: `EncounterCoordinator`가 `card.modifiers`를 resolver의 `actionContext.cardEffects`로 전달 → `ArgumentResolver`가 유효/소비되는 행동에만 `resolution.effects.cardEffects`를 남김 → `ResolutionEffectApplier`는 이를 `appliedCardEffects`에 모음 → coordinator의 `#applyCardEffects()`가 runtime-selected claim/evidence sentinel을 실제 제출 대상으로 바인딩하고 `applyModifierEffects()`/`#applyEncounterEffect()`로 상태에 적용한다. **`ResolutionEffectApplier` 자체가 각 effect type을 해석하는 구조는 아니다.**
- **E1-A 완료 근거**: `tests/judgment/card-effects.test.ts`가 자원 조정, `SET_CLAIM_STATE`, selected evidence 확장, `GRANT_EVIDENCE`/`REVEAL_CLAIMS`, invalid 행동 미적용, shipped effect vocabulary를 고정한다.
- **E1-B 완료 근거**: `cards.json`의 clarify/confirm/contradict/recover/pressure/forensic/special 계열에 modifier가 저작되었고 `strings.ko.json` 설명도 현재 수치와 일치한다. 다만 “구조화 effect 수치 ↔ 한국어 설명”을 자동 비교하는 테스트는 없으므로 이후 밸런스 변경 시 함께 수정한다는 수용 기준을 유지한다.

**1.1.2 카드 아트 에셋 계약**

- 일러스트는 `card_illust 256×256` 규격이며 `InterrogationCardView.artAssetKey`가 있으면 우선한다. 현재 콘텐츠 스키마/세션은 카드별 `artAssetKey`를 저작하지 않으므로 화면은 `createInterrogationScreen.ts`의 intent→registry key 매핑(`card/질문/일러`, `card/모순/일러`, `card/압박/일러`)으로 3종을 재사용한다. **카드별 아트를 목표로 한다면 에셋 추가만으로는 부족하고 content→view model 키 배선이 필요하다.**

현재 `InterrogationCardView.intent`는 `QUERY`·`CONTRADICT` 같은 엔진 토큰이고 `drawCardCopy()`가 그대로 그린다.
target에서는 app 계층이 `ACTION_INTENTS`를 기준으로 다음 두 exhaustive catalogue를 조립한다.

```ts
type CardIntentVisualRole =
  | 'QUESTION' | 'SUPPORT' | 'CONTRADICTION'
  | 'PRESSURE' | 'RECOVERY' | 'FORENSIC' | 'SPECIAL';

type CardIntentPresentationDefinition = Readonly<{
  labelKey: string;          // 아래 intent.* catalogue key 중 하나
  visualRole: CardIntentVisualRole;
  illustrationAssetKey: string;
}>;

type CardIntentPresentation = Readonly<{
  intentLabel: string;       // app의 t(labelKey, fallback)로 이미 해석됨
  visualRole: CardIntentVisualRole;
  illustrationAssetKey: string;
}>;

const CARD_INTENT_PRESENTATION_DEFINITIONS = {
  QUERY:       { labelKey:'intent.query',       visualRole:'QUESTION',      illustrationAssetKey:'card/질문/일러' },
  CLARIFY:     { labelKey:'intent.clarify',     visualRole:'QUESTION',      illustrationAssetKey:'card/질문/일러' },
  CONFIRM:     { labelKey:'intent.confirm',     visualRole:'SUPPORT',       illustrationAssetKey:'card/질문/일러' },
  CONTRADICT:  { labelKey:'intent.contradict',  visualRole:'CONTRADICTION', illustrationAssetKey:'card/모순/일러' },
  RECOVER:     { labelKey:'intent.recover',     visualRole:'RECOVERY',      illustrationAssetKey:'card/질문/일러' },
  PRESSURE:    { labelKey:'intent.pressure',    visualRole:'PRESSURE',      illustrationAssetKey:'card/압박/일러' },
  FORENSIC:    { labelKey:'intent.forensic',    visualRole:'FORENSIC',      illustrationAssetKey:'card/모순/일러' },
  SPECIAL:     { labelKey:'intent.special',     visualRole:'SPECIAL',       illustrationAssetKey:'card/압박/일러' },
  COMMIT:      { labelKey:'intent.commit',      visualRole:'CONTRADICTION', illustrationAssetKey:'card/모순/일러' },
  CROSS_CHECK: { labelKey:'intent.cross_check', visualRole:'FORENSIC',      illustrationAssetKey:'card/모순/일러' },
} satisfies Readonly<Record<ActionIntent, CardIntentPresentationDefinition>>;
```

- `ACTION_INTENTS`의 `CROSS_CHECK`까지 모든 값이 map에 있어야 하며 `satisfies Record<ActionIntent, ...>`와 전수 테스트로
  신규 intent 누락을 compile/test failure로 만든다. 아직 엔진 행동이 reserved인 것과 표시 catalogue 누락은 별개다.
- `content/common/strings.ko.json`에는 정확히 다음 10개 표시 키를 추가한다:
  `intent.query`, `intent.clarify`, `intent.confirm`, `intent.contradict`, `intent.recover`, `intent.pressure`,
  `intent.forensic`, `intent.special`, `intent.commit`, `intent.cross_check`. 한국어 값은 각각
  `질문/명료화/확인/모순 제시/회복/압박/감식/특수/진술 확정/교차 검증`을 기본 copy로 삼고 catalogue에서만 튜닝한다.
- target `InterrogationCardView`/`CardArtworkFace`는 표시용 raw `intent` 대신 완성 `intentLabel`과 `visualRole`, 우선 적용된
  `artAssetKey`를 받는다. `cardArtwork.ts`의 색·placeholder와 `createInterrogationScreen.ts`의 fallback art 선택도 raw token
  map을 제거하고 이 role/art output만 사용한다. gameplay callback은 `cardId`로 식별하므로 UI가 engine intent를 보유할
  이유가 없다.
- fan/modal/autoplay `displayStrings`는 같은 `intentLabel`을 사용하며 raw `QUERY|CLARIFY|...|CROSS_CHECK`가 사용자
  노출 문자열에 남으면 실패한다. `src/app/autoplayPort.ts#AUTOPLAY_VISIBLE_STRING_FIELDS`에 `intentLabel`을 명시적으로
  추가한다(또는 필드명을 기존 allowlist의 `label`로 통일한다). 카드별 `artAssetKey`가 있으면 그것이 우선하되 fallback
  definition map은 여전히 전수여야 한다.

### 1.2 UI Component & Layout Wireframes — 3분할 고정 레이아웃

`cardArtwork.drawCardCopy()`는 이미 CP를 **좌상단**에 두고 설명을 팬/모달 모두에 렌더한다. 아래 3분할은 구현된 목표 좌표이며, 잔여 작업은 실제 14종 한국어 glyph overflow와 브라우저 픽셀 검증이다. **모든 좌표는 저작 공간 640×725 기준**(팬에서 0.2배 → 128×145, 모달에서 원본 크기).

```
┌─────────────────────────────────────────────┐  640×725 (card_base)
│ ┌───────┐  카드명 (fontSize 40, 중앙)        │
│ │ 2 CP  │                                   │ ← 좌상: CP 뱃지 (신규 위치)
│ └───────┘                                   │    88×56 라운드 픽셀 뱃지
│              ┌───────────────────┐          │
│   intent     │                   │          │
│   라벨        │   일러스트 256×256  │          │ ← 우측: illust 레이어
│   (좌중단)    │   x=344, y=176    │          │    (기존 중앙 → 우측 정렬로 이동)
│              └───────────────────┘          │
│ ┌─────────────────────────────────────────┐ │
│ │ 설명·효과 텍스트 (fontSize 40 저작        │ │ ← 중하단: 설명 고정 영역
│ │  = 팬 0.2배에서 8px, 자동 줄바꿈,         │ │    x=40, y=470, w=560, h=215
│ │  wordWrapWidth 560, lineHeight 46)      │ │    (기존: 모달 전용 → 항상 렌더)
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**구현된 파일과 계약:**

| # | 파일 | 변경 |
|---|---|---|
| 1 | `src/ui/widgets/cardLayout.ts` | **완료** — illust `x:344,y:176`, `CARD_COPY_RECTS`, font/line-height, 4줄 capacity, 팬/모달 좌표 헬퍼 |
| 2 | `src/ui/widgets/cardArtwork.ts` | **완료** — 좌상 CP plate, 상시 description(비어 있으면 생략), title/intent/ordinal 재배치, base art 부재 시 설명 plate |
| 3 | `tests/ui/card-artwork.test.ts` | **완료(기하 단위)** — 영역 비중첩, badge/description/ordinal, 0.2배→8px 환산, 4줄 capacity |
| 4 | 실제 14종 콘텐츠/브라우저 | **미검증** — 한국어 title/description의 실제 glyph wrap/overflow 및 1280×800 NEAREST 출력은 단위 기하 테스트만으로 증명되지 않음 (`CARD-VISUAL-06`) |

> **주의**: 명세의 "fontSize: 8"은 **화면 표시 크기**다. 저작 공간(640×725)은 팬에서 0.2배 축소되므로 저작 fontSize 40이 정확히 화면 8px이다. 저작 공간에 8을 쓰면 화면에서 1.6px가 되어 판독 불가 — 반드시 저작 40으로 지정한다.

### 1.3 로직 흐름 (변경 없음 확인)

CP 차감·부족 검증은 이미 `spendCommandPoints`(제출 시 잠정 차감 + 실패 롤백, 본 세션에서 보강 완료)와 `cardPlayability`(오토플레이 포트)로 동작한다. 3분할은 순수 표시 변경이며 `cardFan`의 드래그·점선·드롭 판정(`findCardDropTarget`)에 영향이 없다(레이어 rect만 참조).

단, “영향이 없다”는 정적 구조상 결론이며 실제 포인터 계약은 `tests/ui/card-widget-interactions.test.ts`가 별도로 고정한다. 레이어가 늘거나 hit area가 바뀌면 해당 테스트와 실제 브라우저 drag를 함께 재검증한다.

---

## 2. 기능 2 — 태그↔증거 모순 지점 텍스트 연출

> **현재 상태: 제출 후 피드백과 제출 전 scope 프리뷰 구현, stale preview clear와 autoplay ephemeral 문자열 수집 미완료.**

### 2.1 Architecture: judgment-ui-map 런타임 배선 (감사 U-3 해소)

데이터 파이프라인은 구현되었다. 원 설계보다 UI 렌더 책임을 `judgmentBanner.ts`로 별도 분리했고, 맵 미로드 시에도 tone 폴백으로 부팅을 계속한다.

```
judgment-ui-map.json ──(신규 JudgmentUiMapRepository)──▶ bootstrap
Resolution{code, axes, feedback.missingScopes} ─┐
claim.canonicalMeaning (PublicDTO statement) ───┼─▶ (신규 buildJudgmentFeedback, app 계층)
evidence.displayName (PublicDTO evidence) ──────┘         │
                                                          ▼
                        InterrogationScreenController.showJudgmentFeedback(view)
                                                          ▼
                        심문 화면 하단 피드백 배너 (신규 UI 위젯, ui 계층 — 문자열만 수신)
```

| # | 파일 | 내용 |
|---|---|---|
| 1 | `src/content-io/JudgmentUiMapRepository.ts` | **완료** — `ValidatedRuntimeJsonRepository`로 canonical URL을 로드하고 404/invalid를 `undefined`로 degrade |
| 2 | `src/app/judgmentFeedback.ts` | **완료** — tone, scope 우선 detail, 폴백, 포맷 조립을 수행하며 UI에는 완성 문자열만 전달 |
| 3 | `src/ui/screens/interrogation/model.ts` | **완료** — `JudgmentFeedbackView`에 tone/headline/statement/evidence/detail과 최종 `text` 포함 |
| 4 | `src/ui/screens/interrogation/judgmentBanner.ts` | **현행 완료** — `(6,276)`, **628×11**, tone 색, 비인터랙티브, 1줄 말줄임. 폭 계산은 실제 font metric이 아니라 문자군 휴리스틱임. 자매 문서의 160.5px desk 재배치 target에서는 §2.4 lane으로 이동해야 함 |
| 5 | `src/ui/screens/interrogation/createInterrogationScreen.ts` | **완료** — `showJudgmentFeedback`/`clearJudgmentFeedback`를 컨트롤러에 노출 |
| 6 | `src/app/bootstrap.ts` | **부분 완료(직접 자동화 부족)** — 제출 전 scope preview 및 제출 후 리마운트 피드백을 controller에 주입. 무효/해제 selection에서 이전 preview를 clear하지 않음 |
| 7 | `content/common/strings.ko.json` | **완료** — 현재 총 322키 중 `judgment.*` 27개, 그중 `judgment.feedback.*` 13개 |

### 2.2 State Machine & Logic Flow — 텍스트 조립 규칙

`buildJudgmentFeedback`의 실제 입력에서 **필수는 `resolution` 하나뿐**이다. `statement`, `evidenceNames`, `uiMap`,
`headline`, `tone`, `detail`은 모두 optional이며, 빈 statement/evidence와 map 미로드도 읽을 수 있는 폴백을 만든다.

```
현재 tone 결정:
  axes.validity === 'INVALID'                → 'INVALID'
  code === 'R_PROCEDURE_VIOLATION'           → 'INVALID'
  code === 'R_DIRECT_CONTRADICTION'
    ∨ code === 'R_INDIRECT_SUSPICION'        → 'CONTRADICTION'
  CONFIRM 성공 + QUERY/CLARIFY/COMMIT/FORENSIC/PRESSURE/RECOVER/SPECIAL 성공 코드 → 'SUPPORT'
  그 외 실패·거절·근거부족·무관·진실공격 코드 → 'MISS'

headline  = t(uiMap?.resolution_codes[code].label_key)          // "직접 모순" 등
            ?? tone별 catalogue/inline fallback
detail 우선순위:
  1) feedback.missingScopes 비어있지 않음
       → uiMap이 있으면 missingScopes.map(s => t(uiMap.proof_scopes[s].missing_feedback_key)).join(' ')
         (예: "장소를 증명할 증거가 더 필요하다.")
  2) 아니면 uiMap의 resolution code feedback
  3) uiMap이 없거나 비어 있으면 tone별 catalogue/inline suffix fallback
조립(현재 `strings.ko.json`의 `judgment.feedback.format`
     = '진술 "{statement}" ↔ 증거 {evidence} · {headline} — {detail}'):
  statementQuote = statement ?? t('judgment.feedback.no_statement', ...)
  evidenceQuote  = evidenceNames.join('·')   // 증거 미첨부 시 t('judgment.feedback.no_evidence','제출 증거 없음')
```

명세 예시의 콜론/대괄호형 문자열은 **문자열 catalogue가 설치되지 않았을 때의 코드 폴백**이고, 정상 한국어 catalogue
출력은 `진술 "…" ↔ 증거 … · 헤드라인 — 상세` 형식이다. `statement`는 제출 대상 PublicDTO claim의
`canonicalMeaning`, evidence는 `displayName`이다. 헤드라인·디테일은 저작 문자열이므로 문구 튜닝은 catalogue에서 한다.

**현재 피드백 스트링 키(13개)**: `format`, `no_evidence`, `no_statement`, `contradiction`, `contradiction_suffix`, `support`, `support_suffix`, `miss`, `miss_suffix`, `invalid`, `invalid_suffix`, `preview`, `preview_ready` (`judgment.feedback.` 접두사). 전체 `judgment.*`는 현재 27개이며 총 문자열 수와 함께 검증 시 동적으로 산출한다. `tests/app/judgment-feedback.test.ts`가 모든 엔진 resolution code의 tone/폴백/원시 키 부재와 preview missing/ready를 검증한다.

포맷 문자열은 현재 런타임 `replaceAll` 계약이며 스키마 수준 placeholder 검증은 없다. 수용 기준은 `{statement}`, `{evidence}`, `{headline}`, `{detail}` 네 토큰을 보존하고 조립 결과에 미치환 `{…}`가 남지 않는 것이다. 번역 변경 시 이 조건을 기능 테스트로 고정한다.

### 2.3 제출 전 프리뷰

`buildEvidencePreviewFeedback()`와 bootstrap `previewSelection()`이 구현됐다. CONFIRM/CONTRADICT 카드의 target claim과 proof rule을 찾고, docked evidence scope 합집합을 required scopes와 비교한다. 다만 이 계산은 **scope coverage만** 보며 confidence, source count, integrity, 관계/방향, 계층 반박을 아직 판정하지 않는다. 현 구현은 부족하면 MISS, 모두 덮으면 SUPPORT 색을 쓰므로 헤드라인이 “증거 검토”여도 성공처럼 오인될 수 있다.

target은 `JudgmentFeedbackTone`에 UI-local 중립 `PREVIEW`를 추가하고, ready/missing 모두 같은 중립 색을 사용한다.
문구는 각각 “필수 범위 충족 · 최종 판정 전” / “필수 범위 부족 · 최종 판정 전”처럼 coverage 사실만 말한다.
`SUPPORT`·`CONTRADICTION`은 제출된 `Resolution`에만 허용한다. app 조립기가 engine enum을 UI에 넘기지 않고 완성
tone/text를 만든다는 계층 경계는 유지한다.

**알려진 lifecycle 결함과 확정 상태 머신**: `previewSelection()`의 유효하지 않은 경로가 모두 단순 return이다. 한 번
표시된 뒤 card/facet 해제, evidence 제거, QUERY 등 다른 intent 전환, rule 미발견이 발생하면 이전 preview가 남는다.
제출마다 controller가 파괴·재생성되므로 다음 canonical 상태는 **bootstrap의 app-owned transient state**가 소유한다.
screen model/controller와 DEV presentation queue는 매 revision마다 이 한 상태의 immutable projection만 받는다.

```ts
type JudgmentBannerState =
  | { readonly kind: 'HIDDEN' }
  | { readonly kind: 'PREVIEW'; readonly feedback: JudgmentFeedbackView; readonly selectionRevision: number }
  | { readonly kind: 'RESOLUTION'; readonly feedback: JudgmentFeedbackView; readonly shownAtMonotonicMs: number;
      readonly shownAtRenderRevision: number; readonly presentationId: number };

const JUDGMENT_FEEDBACK_DWELL_MS = 700;
const JUDGMENT_FEEDBACK_MIN_VISIBLE_RENDER_TICKS = 1;
const JUDGMENT_FEEDBACK_WATCHDOG_MS = 1_500;
```

- `dispatchSelectionEdit(nextSelection)`이 lifecycle의 유일한 사용자 편집 진입점이다. 현재 상태가 PREVIEW든
  RESOLUTION이든 첫 explicit edit에서 먼저 HIDDEN으로 바꾼 뒤 revision을 올리고, 유효한 CONFIRM/CONTRADICT +
  docked evidence + rule일 때만 같은 revision의 새 PREVIEW를 설치한다. 단순 screen remount/replay는 explicit edit가
  아니므로 RESOLUTION을 지우지 않는다. encounter 변경/화면 destroy는 모두 clear한다.
- submit 성공은 기존 PREVIEW를 RESOLUTION으로 원자 교체한다. 그 뒤 사용자 selection edit는 위 dispatcher만 거치므로
  ‘RESOLUTION은 selection 경로가 지우지 않는다’와 ‘다음 edit가 지운다’는 두 규칙을 따로 두지 않는다.
- 모든 성공 제출 sequence는 시작과 동시에 같은 completion token에 `performance.now()` 기준
  `JUDGMENT_FEEDBACK_WATCHDOG_MS`의 cancellable wall-clock watchdog을 건다. foreground 정상 경로에서 non-terminal은
  최소 한 번의 실제 render tick 뒤 진행하고, terminal `queueEncounterOutcome`만 그 tick에 더해
  `JUDGMENT_FEEDBACK_DWELL_MS`를 충족한 뒤 실행한다. deadline까지 각 경로의 조건(non-terminal: 1 tick,
  terminal: 1 tick+700ms)을 충족하지 못하면 `JUDGMENT_DWELL_DEGRADED{presentationId,renderTicks,elapsedMs}` telemetry를 먼저
  기록하고 명시적 degraded continuation으로 outcome을 진행한다. 숨김/스로틀 탭에서도 무한 대기하지 않으며 정상
  foreground 경로에서는 degraded event가 0이어야 한다. ticker와 watchdog은 같은 completion token을 원자 소비하고
  destroy 시 둘 다 취소한다. 사용자가 skip 가능한 경우에도 resolution telemetry에는 결과를 먼저 기록한다.
- `AutoplayScene.displayStrings`와 feedback telemetry는 이 canonical state에서 파생한다. controller에 나중에 imperatively
  그린 문자열을 별도 수집해 서로 어긋나게 하지 않는다.

#### 2.3.1 ephemeral 피드백의 오토플레이 관측 계약

화면 최상단 scene이 `DIRECTION`으로 즉시 바뀌면 그 아래 INTERROGATION 배너는 실제로 한 tick 보였더라도 다음
`collectAutoplaySceneStrings()`에서 사라질 수 있다. 따라서 단순히 `displayStrings`를 한 번 더 읽는 방식으로
`AUTO-FEEDBACK-02`를 닫지 않는다. autoplay가 활성화된 app 경계에만 다음 **단조 증가 presentation queue**를 둔다.
엔진/세이브 상태가 아니며 일반 플레이에서는 생성하지 않는다.

```ts
interface PresentationTelemetryItem {
  readonly id: number; // run-local monotonic, 재사용 금지
  readonly kind: 'JUDGMENT_PREVIEW' | 'JUDGMENT_RESOLUTION';
  readonly text: string;
  readonly createdAtRenderRevision: number;
}

interface AutoplayScenePresentation {
  readonly presentationRevision: number;
  readonly pendingPresentations: readonly PresentationTelemetryItem[];
  readonly ackPresentation: (id: number) => void;
}
```

- PREVIEW/RESOLUTION을 canonical `JudgmentBannerState`에 설치하는 **같은 동기 단계**에서 queue에 넣는다. scene kind가
  바뀌어도 unacked item은 다음 `AutoplayScene`의 `displayStrings`와 `pendingPresentations`에 계속 합성한다.
- report collector가 새 `presentationRevision`의 문자열과 raw-key 부재를 기록한 뒤에만 `ackPresentation(id)`한다.
  driver가 action을 결정했다는 이유만으로 선제 ack하거나, 시간 경과만으로 drop하지 않는다. ack는 idempotent이고
  run destroy에서 queue 전체를 폐기하며, 상한 초과는 조용히 유실하지 않고 autoplay invariant failure다.
- L2 INTERROGATION port는 엔진 상태를 바꾸지 않는 `previewSubmission(selection)`을 노출한다. best/video는 각 encounter에서
  preview 가능한 첫 deterministic legal CONFIRM/CONTRADICT 선택이 있으면 실제 제출 전에 이를 한 번 호출하고, 새 scene
  revision의 PREVIEW를 한 render tick 관측·scan·ack한 뒤 정책상 제출을 수행한다. preview 가능한 선택이 없는 fixture는
  명시적으로 `previewNotApplicable`을 report하며 성공으로 위조하지 않는다.
- 정상 foreground에서는 모든 제출이 RESOLUTION item을 enqueue하고 최소 한 render tick을 지난 뒤 다음 action을 허용한다.
  no-render 환경은 위 1,500ms watchdog이 `JUDGMENT_DWELL_DEGRADED`를 기록한 뒤 scene 진행만 허용하는 명시적 예외다.
  이 예외도 item을 drop/ack하지 않으므로 L2의 다음 action은 collector의 scan/ack가 끝나야 가능하다. 방향 overlay가
  결과를 덮은 뒤에도 collector는 queue로 결과를 scan/ack하여 visual dwell/degraded 근거와 문자열 coverage를 각각 증명한다.
- unit/browser UI 테스트는 수동 selection의 중립 preview lifecycle을 검증하고, L2 테스트는 preview-before-submit,
  resolution-before-next-action, revision 단조성, 중복/유실 0, ack 이전 scene 전환, raw developer key 0을 검증한다.

### 2.4 자매 desk 설계와의 배너 lane 합성

현 화면에서는 태그 행이 `250..276`, statement panel 위 경계가 287이므로 `(6,276,628,11)`이 정확한 실측값이다.
그러나 자매 문서의 target은 태그 행을 `205.5..231.5`, desk를 `239.5..400`으로 옮긴다. 현 y=276을 그대로 두면
책상 위 typewriter/interaction 영역과 시각적으로 경쟁한다. combined target에서는 배너를 **desk 상단 상태 lane**
`(6,242,628,11)`로 이동하고 다음을 고정한다.

- 자매 문서의 고정 순서를 따라 root layer 100의 비인터랙티브 overlay로 둔다. 따라서 desk(30),
  typewriter/card(40~50), HUD(60)보다 시각적으로 위이고 modal/error 최상위 input owner 아래다. `eventMode='none'`이므로
  아래 card/typewriter의 pointer owner를 가로채지 않는다.
- 태그 하단과 10.5px 간격이 있어 겹치지 않으며, y=242..253은 typewriter panel y=288보다 위다.
- 불투명 `deepInk` plate와 tone accent를 유지해 desk PNG와의 대비를 보장한다. `eventMode='none'`으로 drag를 막지 않는다.
- `deskLayout.test`와 `judgment-banner.test`가 target 좌표, 태그/타자기 비중첩, z-order를 함께 검증한다. desk 변경 없이
  카드 기능만 먼저 배포하는 branch에서는 현 `(6,276)`을 유지하고 두 좌표를 동시에 canonical이라고 주장하지 않는다.

---

## 3. 기능 3 — 오매칭 시 강압도 상승 비주얼 연출

> **현재 상태: 연출 컨트롤러·화면 통합과 실제 순변화 트리거 구현 완료, i18n 주입·bootstrap 경계 자동화는 부분 완료.**

### 3.1 트리거 정의 (State Machine & Logic Flow)

현재 bootstrap은 이미 제출 전/후 gauge의 실제 차이만 사용한다:

```
const coercionRise = after.coercion - before.coercion;
controller.playCoercionRise(coercionRise); // controller가 <= 0을 무시
```

이 구현을 규범으로 확정한다. 문구가 `+N 강압`이고 게이지 상승 연출이므로 의미값은 모든 resolver/card/modifier/clamp
적용 뒤 `Math.max(0, after.coercion - before.coercion)`이다. 현 controller의 `<=0` guard가 이 max를 담당한다.
95→100 포화면 `+5`, +15 벌점과 -15 카드 효과가 상쇄되면 0, 이미 100이면 0이다. attempted penalty는
JudgmentLog/판정 설명에 남기되 rise UI 숫자로 가장하지 않는다. `R_ACTION_INVALID` 등 실제 delta 0도 무시한다.
잔여는 구현 변경이 아니라 이 네 경계를 실제 submit callback에서 고정하는 회귀다.

명세의 “유효하지 않은/모순 실패 매칭”은 `R_INSUFFICIENT_GROUNDS`·`R_IRRELEVANT_EVIDENCE`·
`R_TRUTH_ATTACKED`처럼 **엔진이 실제 coercion 벌점을 적용한 semantic miss**로 해석한다. 카드 없음·제출 상태 오류 같은
`R_ACTION_INVALID`에 UI가 임의 +15를 만들어 붙이면 CP/card 불소비와 원자 롤백 계약을 깨므로, 그 정책을 원하면
balance/resolver의 별도 제품 변경과 엔진 테스트부터 수행해야 한다.

### 3.2 UI Component 명세 — `punishJuice` 컨트롤러

**구현 파일** `src/ui/screens/interrogation/punishJuice.ts` (ui 계층, 엔진 import 없음 — 숫자만 받는다):

```ts
export interface PunishJuiceController {
  readonly view: Container;                    // 화면 최상단 오버레이 레이어
  readonly active: boolean;
  readonly elapsedMs: number;
  play(coercionDelta: number, anchor: Readonly<{x: number; y: number}>): void;
  update(deltaMS: number): void;               // 화면 티커에 합류
  destroy(): void;
}
export function createPunishJuice(
  stage: Readonly<{width: number; height: number}>,
  options?: { shakeTarget?: Container; pulseTarget?: Container; resourceLabel?: string },
): PunishJuiceController;
```

**3단 연출 타임라인** (총 0.9초, 모두 `update(deltaMS)` 구동 — setTimeout 금지):

| 구간 | 시간 | 연출 | 구현 |
|---|---|---|---|
| ① 셰이크 딤 | 0~300ms | 화면 전체 붉은 딤(`0xB03030`, alpha 0.25→0) + 콘텐츠 컨테이너 수평 셰이크 | 딤: 640×400 `Graphics` 알파 트윈. 셰이크: `offset = round(4 · sin(t/300·π·6) · (1-t/300))` — 이 효과는 의도적으로 **정수 logical offset**을 사용한다(0.5 단위도 허용하는 전역 stage 계약과 구분, §0.2-3). 셰이크 대상은 화면 루트가 아니라 **심문 화면 콘텐츠 컨테이너**(오버레이 자신은 제외) |
| ② 아이콘 펄스 | 0~600ms | `addHud()`가 `HudAnchors.coercionAnchor`로 노출한 강압 아이콘(`아이콘/강압/기본`) 발광 파동 | 아이콘 위에 가산 링 `Graphics.circle` 2개: `scale 1→1.8, alpha 0.8→0` 300ms 주기 2회 + 아이콘 자체 `tint` 펄스(`0xFFFFFF→0xFF6A5A→원복`) |
| ③ 플로팅 텍스트 | 100~900ms | `+15 강압` 픽셀 텍스트 상승 | 구현은 주입된 `resourceLabel` 또는 UI literal `'강압'`을 사용한다. `resource.coercion`은 문자열 표에 있으나 화면 조립에서 주입하지 않는다(`I18N-JUICE-01`). anchor에서 24px 상승, 500ms 이후 페이드, 종료 시 destroy |

`punishDimAlpha(0) === 0`인 현 동작을 **채택**한다. play 호출과 같은 tick에는 투명하고 첫 양의 render tick에서
0.25에 가까운 impact가 나타난 뒤 감소한다. 위 표의 `0~300ms`는 “첫 양의 tick~300ms” 의미다. 테스트는 t=0의 0,
첫 양의 tick의 near-peak, 300ms의 0을 각각 고정하며, 문서와 함수를 맞추기 위해 임의로 t=0을 peak로 바꾸지 않는다.

**구현된 통합 지점** (`createInterrogationScreen.ts`):
- 생성: `createPunishJuice({width:640,height:400}, {shakeTarget:content,pulseTarget:coercionIcon})` 후 root `view`에 append한다. child order상 content 위이며, 나중에 열린 dossier/card modal 아래다.
- 컨트롤러 노출: `addHud()`가 `COERCION_ICON_POSITION`과 `HUD_ICON_SIZE`에서 계산해 반환한 `HudAnchors.coercionAnchor`를 `playCoercionRise(delta)`가 `punish.play()`에 전달한다. 좌표 숫자를 외부 계약으로 복제하지 않는다.
- 티커: `InterrogationScreenController.update()`에 `punish.update(elapsedMs)`가 합류한다.

**부수 훅(무료 개선)**: `addHud()`의 기존 `coercionWarningSlipCount()` 경고 슬립이 연출 종료 후 자연히 갱신된 값으로 리렌더돼 있으므로 추가 작업 없음(리마운트 모델 덕분).

**오디오**: `cueResolution`이 이미 판정별 사운드를 큐잉하므로 신규 오디오 코드는 없다(사운드 파일 부재는 별도 트랙, 감사 A-1).

**자동화 범위**: `tests/ui/punish-juice.test.ts`가 곡선·정수 오프셋·restart/destroy·비인터랙티브 계약을, `tests/ui/interrogation-screen-juice.test.ts`가 화면 content shake/restoration을 검증한다. 실제 bootstrap이 올바른 delta로 새 화면 컨트롤러를 호출하는지는 `APP-WIRING-05`의 잔여다.

---

## 4. 기능 4 — 워크벤치 캐릭터별 파츠 관리

> **현재 상태: v3 모델·12캐릭터 패널·sidecar 왕복은 구현, preview/source-of-truth 통합은 미완료.** 이 절의 실제 모델이 초안의 `sceneSlots` 제안보다 우선한다.

### 4.1 데이터 구조 (Workbench Part Extensions)

구현은 기존 16슬롯 geometry/rotation/locks를 유지하고 캐릭터 이미지·저작 offset을 옆에 추가하는 형태다. localStorage 키는 기존 저장을 찾기 위해 `.v2`를 유지하지만 저장 문서 `version`은 3이다.

**서로 독립인 버전 축과 공동 target을 혼동하지 않는다:**

| 축 | 현재 값 | 공동 target | 소유 설계 / 변경 규칙 |
|---|---|---|---|
| 브라우저 저장 key | `dungeon-dossier.asset-workbench.v2` | **변경 없음** | localStorage namespace일 뿐 document version이 아니다. v3/v4 문서를 같은 key에서 읽어 migration한다. |
| workbench 저장 document | `version: 3` | **`version: 4` 단일 공동 shape** | 본 문서의 character layer·단일 offset 원천·used 관리 상태와 `event_system_custom_scale_deadscene_design.md`의 slot custom sizing/aspect 상태를 **같은 v4**에 합친다. |
| portrait sidecar | `schema_version: '2.0'` | **`3.0`** | 본 카드 문서 소유. canonical v2 12개를 읽는 migration을 유지하면서 김_인턴 `used` 표현을 명시한다. |
| asset manifest | `schema_version: '2.0'` | **`3.0`** | 이벤트/스케일 문서 소유. custom width/height·aspect 계약을 추가한다. portrait sidecar와 별도 schema다. |
| run save | `save_version: 1` | **`2`** | 이벤트/데드씬 문서 소유. workbench/sidecar와 무관하다. |

**충돌 방지 규칙**: `WORKBENCH_STATE_VERSION = 4`를 카드용 shape와 이벤트용 shape로 각각 정의하지 않는다. v4에는 두 문서의 필드를 합친 단 하나의 `WorkbenchState`/`WorkbenchStorageDocument`만 존재해야 하며, `normalizeWorkbenchState`는 v2와 현행 v3를 그 합성 v4로 올린다. portrait sidecar 3.0, asset manifest 3.0, save 2는 숫자가 비슷해도 독립 migration이다. storage key를 `.v3`/`.v4`로 바꾸지 않는다.

**portrait sidecar 3.0 범위 결정(규범)**: v3는 단순 upset/lose 좌표 파일이 아니라 **한 캐릭터의 파츠 저작 상태를 완전히 왕복하는 파일**로 올린다.

- 파일은 명시적 `character`를 가지며, `parts`는 semantic part 이름으로 식별한다. 모든 캐릭터에 `base/upset/lose`가 필수이고 **`김_인턴`에는 `used`도 필수**다. 다른 캐릭터의 `used`, 중복 part, 파일명에서 추론한 캐릭터와 본문 `character` 불일치는 거부한다.
- 각 part는 `image`, 저작 `width/height`, `transform:{ offsetX, offsetY, rotation, shearX, scaleX, scaleY }`,
  `preserveAspectRatio`, `layer`, authoring `isLocked`를 가진다. offset 단위는 기존 v2와 같은 **512×512 authored source
  pixel**이며 해당 캐릭터 base 기준이다. offset은 유한 실수로 보존하고 UI 기본 step만 1 source px로 둔다. 기본 suspect
  rect에서는 source 1px가 `216/512 = 0.421875` logical이며, preview/runtime은 이 값을 계산한 뒤 최종 위치를 0.5
  logical render grid에 맞추되 authored 값을 다시 쓰지 않는다. `shearX`는 legacy 독립 슬롯의 affine을 무손실로
  옮기기 위한 유한 QR shear 계수이며 신규 저작 기본값은 0이다. rotation/shear/scale/layer 범위와 aspect/lock 의미는 §4.3의
  shared validator가 강제하며 동률일 때 semantic part 순서로 안정 정렬한다.
- sidecar는 stage 슬롯 좌표를 복제하지 않는다. 현행 semantic part→stage slot은 workbench의
  `characterPartSlotId()`/`SLOT_CHARACTER_BINDINGS`에만 있지만, target에서는 공용
  `PORTRAIT_PART_SLOT_BINDINGS`를 `src/ui/core/portraitPartsManifest.ts`로 추출해 workbench/runtime이 공유한다.
  binding key는 part 하나가 아니라 **`(usageRole, part)`**다. `SUSPECT/base|upset|lose`는 모두 전역
  `suspect-base` anchor를, `PARTNER/base|used`는 모두 `partner-base` anchor를 사용한다. 현행/legacy migration source slot은
  각각 `suspect-base/suspect-state-parts/suspect-lose-parts/partner-base/partner-used`이지만, migration 뒤 state slot은
  frozen canonical sample일 뿐 character preview나 승인 runtime에 합성하지 않는다. `김_인턴`은 partner usage에서 base/used가 pinned되고, suspect preview usage에서는
  선택 캐릭터 규칙의 base/upset/lose를 따른다. role별 허용 part를 exhaustive record로 검증한다.
  PNG 본문도 JSON에 embed하지 않고 파일 참조만 보관한다.
- v2 importer는 기존 `base + state_parts(upset/lose)`의 `slot/origin/width/height`를 엄격 검증한 뒤 v3로 올리고
  `rotation:0`, `shearX:0`, `scaleX:1`, `scaleY:1`, `preserveAspectRatio:true`, `isLocked:false`, canonical stable layer를 채운다.
  `김_인턴` v2에는 used entry가 없으므로 registry에 canonical `portrait_김_인턴_used.png`가 실제 있을 때만 그 ref와
  default local transform/layer를 파생한다. 파일이 없는데 빈 used를 합법화하지 않고 production migration을 실패시킨다.
  canonical 12개 파일을 읽은 결과의 기존 base/upset/lose 렌더가 바뀌면 안 된다. v3 serializer는 `김_인턴 used`와 모든
  transform/aspect/layer/lock을 누락 없이 재출력한다.
- 공동 workbench v4의 `characters[character]`도 이 동일한 part transform/layer 상태를 mirror한다. 이벤트 설계의 slot `customWidth/customHeight/preserveAspectRatio` 필드는 같은 v4 document에 합치되, portrait sidecar 자체는 character-part relative transform만 소유하고 asset manifest 3.0의 stage transform을 복제하지 않는다.

```ts
export const WORKBENCH_STORAGE_KEY = 'dungeon-dossier.asset-workbench.v2';
export const WORKBENCH_STATE_VERSION = 3;
export const WORKBENCH_CHARACTERS = [
  '물컹이', '하피', '미노타우로스', '고블린', '오크', '서큐버스',
  '드워프', '사이클롭스', '켄타우로스', '타락한_용사', '김태훈', '김_인턴',
] as const;

type CharacterPartName = 'base' | 'upset' | 'lose' | 'used';

export interface CharacterPartsState {
  readonly images: Readonly<Partial<Record<CharacterPartName, SlotImageState>>>;
  readonly offsets: Readonly<Partial<Record<CharacterPartName, Point>>>;
}

export interface WorkbenchState {
  readonly version: 3;
  readonly geometry: Readonly<Record<SlotId, Rect>>;
  readonly rotation: Readonly<Record<SlotId, number>>;
  readonly locks: Readonly<Record<SlotId, boolean>>;
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
  readonly activeCharacter: WorkbenchCharacter;
  readonly characters: Readonly<Record<WorkbenchCharacter, CharacterPartsState>>;
}
```

위 코드는 **현행 v3**다. 공동 target v4에서는 `offsets`만 늘리는 별도 map 대신 이미지와 `transform/layer`가 같은 semantic part 아래 묶여야 하며, stage preview·localStorage·portrait sidecar 3.0이 그 한 원천을 사용해야 한다. event/custom-scale 문서의 slot sizing 상태도 같은 v4 타입에 병합한다.

```ts
/** Canonical combined target. This is the only WorkbenchState v4 shape. */
interface CharacterPartTransformState {
  readonly offsetX: number; // finite authored-source px
  readonly offsetY: number;
  readonly rotation: number; // finite radians
  readonly shearX: number;   // finite QR shear coefficient; authored default 0
  readonly scaleX: number;   // finite > 0
  readonly scaleY: number;
}

interface CharacterPartStateV4 {
  readonly image?: SlotImageState;
  readonly transform: CharacterPartTransformState;
  readonly preserveAspectRatio: boolean;
  readonly layer: number;    // finite integer, stable semantic tie-break
  readonly isLocked: boolean; // authoring lock; runtime geometry에는 영향 없음
}

type SharedCharacterPartName = 'base' | 'upset' | 'lose';
type CharacterPartsV4<C extends WorkbenchCharacter> =
  C extends '김_인턴'
    ? Readonly<Record<SharedCharacterPartName | 'used', CharacterPartStateV4>>
    : Readonly<Record<SharedCharacterPartName, CharacterPartStateV4>>
      & Readonly<{ used?: never }>;

type WorkbenchCharactersV4 = Readonly<{
  [C in WorkbenchCharacter]: { readonly parts: CharacterPartsV4<C> }
}>;

interface SlotSizingState {
  readonly customWidth?: number;
  readonly customHeight?: number;
  readonly preserveAspectRatio: boolean;
}

interface WorkbenchStateV4 {
  readonly version: 4;
  readonly geometry: Readonly<Record<SlotId, Rect>>;
  readonly rotation: Readonly<Record<SlotId, number>>;
  readonly locks: Readonly<Record<SlotId, boolean>>;
  /** Non-character preview images only; bound portrait slots resolve from characters. */
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
  readonly sizing: Readonly<Record<SlotId, SlotSizingState>>;
  readonly activeCharacter: WorkbenchCharacter;
  readonly characters: WorkbenchCharactersV4;
}
```

v4 normalizer는 image 유무와 무관하게 모든 캐릭터의 base/upset/lose `CharacterPartStateV4`를 canonical transform/aspect/
layer/lock 기본값으로 materialize하고, `김_인턴`에는 used도 항상 materialize한다. `image`만 optional이며 transform 객체
자체에는 fallback/undefined 경로가 없다. 다른 캐릭터의 used는 parser/action/type에서 거부하고, sidecar 3.0 승인 export는
각 required part의 `image`까지 존재하지 않으면 실패한다.

`geometry/rotation/sizing`은 일반 stage slot 상태지만 portrait runtime의 **전역 권한은 `GlobalPortraitAnchorSlotId =
'suspect-base' | 'partner-base'` 두 개뿐**이다. `FROZEN_PORTRAIT_SAMPLE_SLOT_IDS =
['suspect-state-parts','suspect-lose-parts','partner-used']`는 legacy migration input으로만 한 번 읽는다. 상대 affine을
해당 character part로 옮긴 직후 이 세 slot의 geometry/rotation/sizing을 catalogue canonical sample로 덮고 lock=true로
고정하며, bound `images`도 제거한다. 이후 저장된 legacy transform/lock 값은 어떠한 권한도 갖지 않는다.

세 frozen sample은 global gizmo hit target/geometry inspector/character preview/runtime layout/portrait sidecar export에서
제외한다. 16-slot asset-manifest schema가 AUTHORING_ONLY entry를 요구하면 exporter는 사용자 state가 아니라 catalogue의
고정 canonical sample만 내보낸다. 화면 preview는 `suspect-base`/`partner-base` editable global anchor와
`characters[*].parts[*]`를 공용 affine resolver로 합성하고, part drag·수치·layer·lock 편집은 character-part action만
dispatch한다. 따라서 같은 gesture가 global sample과 character part를 함께 쓰거나 수정할 수 없다.

`characters[*].parts[*].transform/layer/isLocked`가 anchor 안의 유일한 character-local 원천이다. 같은 x/y/lock을 두 곳에
복제하지 않으며, 전역 anchor 편집은 명시적 `STAGE_ANCHOR` mode에서 base anchor 두 개에만 허용하고 character part 편집은
`CHARACTER_PART` mode에서만 허용한다. mode 전환은 현재 drag를 cancel하며 한 pointer sequence는 정확히 한 action 원천만
갱신한다.
`WorkbenchStorageDocumentV4`는 현행처럼 global geometry/rotation/sizing을 v3 `AssetTransform`의
`transforms: Record<SlotId, AssetTransform>`로 합쳐 저장하고, character part는 `characters`에 한 번만 저장한다.
메모리 필드와 `transforms`를 둘 다 직렬화해 두 원천을 만들지 않으며 load 시 transform을 다시 세 필드로 분해한다.
serializer는 frozen 세 key를 매번 catalogue canonical sample로 재작성하고 parser는 최초 migration 뒤 입력값을 사용자
상태로 복원하지 않는다. 따라서 16-slot shape는 유지되지만 그 세 값이 다시 편집 원천이 될 수 없다.
현 v2→v3 구현은 stage 4px 차이를 `round(4×512/216)=9` authored px로 만든다. raw v2를 읽는 target v2→v4 경로는
`4×512/216=9.481481…`을 유한값 그대로 보존해 다시 투영했을 때 정확히 4 logical이 되게 한다. 이미 저장된 v3의
정수 9는 작성된 사용자 데이터로 존중하고 임의 보정하지 않는다.

**완료된 현행 마이그레이션**: `normalizeWorkbenchState()`가 v2의 suspect 이미지와 stage rect 차이를 기본 캐릭터 `물컹이`의 images/저작 offset으로 옮기고, partner base/used는 `김_인턴`에 귀속한다. malformed 저장은 초기 상태로 복구한다. `tests/ui/workbench-character-parts.test.ts`가 v2→v3와 저장/로드 왕복을 검증한다.

**target v4 복구 안전성**: `normalizeWorkbenchStateV4(v4)`는 deep-semantic idempotent no-op이고, canonical
`serialize→parse→serialize`만 byte-stable로 고정한다. raw v2의 exact migration과 과거에 이미 저장된 v3는 중간 반올림으로
정보가 소실됐으므로 같은 canonical state라고 단언하지 않는다. raw v2→업데이트된 in-memory character migration→v4는
중간 직렬화 없이 direct raw v2→v4와 같아야 하고, historical v3→v4는 저장돼 있던 정수 값을 보존한다.
`version > 4`는 malformed로 초기화/덮어쓰기하지 않고 read-only 오류와 원본
export 경로를 제공한다. 파싱 불가 raw localStorage도 별도 backup key/download로 보존한 뒤에만 기본 상태로 복구한다.
`activeCharacter`는 **workbench localStorage v4의 편집 UI 상태**이며 portrait sidecar 3.0 필드가 아니다.

**내보내기/가져오기**:
- `serializeCharacterPartsManifest(state, character)`는 기존 12개 파일과 byte-identical한 v2.0 shape를 만든다. `state_parts`의 두 항목은 호환을 위해 모두 `slot:'suspect-state-parts'`를 사용한다.
- `withImportedCharacterParts()`는 upset/lose x/y를 캐릭터 상태에 되돌린다. PNG 본문은 sidecar에 없으므로 별도 드롭한다.
- `김_인턴 used` PNG는 패널/localStorage에서 관리되지만 **현행 v2.0 sidecar에는 used 항목이 없어 offset·파일이 내보내기/가져오기 계약에 포함되지 않는다.** target portrait sidecar 3.0은 used를 필수 part로 포함하고, 모든 캐릭터의 per-part transform/layer와 함께 왕복한다.
- 현재 parser는 완전한 sidecar schema validator가 아니다. `WB-SIDECAR-04`가 닫히기 전에는 “임의 JSON 왕복 안전”이 아니라 “checked-in 12개 canonical 파일 왕복”만 보장한다.

### 4.2 UI 확장 (`workbench/main.mts` + `index.html`)

```
┌ 캐릭터 파츠 ──────────────────────────────┐
│ 캐릭터: [물컹이 ▼]  (12종 드롭다운)         │
│ ┌────────┬────────┬────────┬────────┐    │
│ │ base   │ upset  │ lose   │ (used) │    │ ← characterPartNames() 기반 동적 생성
│ │ [img]  │ [img]  │ [img]  │  ...   │    │    <planner-image-slot> 재사용
│ └────────┴────────┴────────┴────────┘    │
│ 선택 파츠: upset                            │
│ X [ 0.0] Y [ 0.0]  회전° [ 0.0]            │ ← X/Y만 현행 구현
│ Sx [1.00] Sy [1.00] Shx [0.00] [✓ 비율 유지]│ ← target (Shx는 고급/legacy affine)
│ 레이어 [ 20] [↑][↓] [초기화] [🔒 고정]      │ ← target
│ [사이드카 내보내기] [사이드카 가져오기]       │
└──────────────────────────────────────────┘
```

- **구현됨**: 12종 드롭다운, 캐릭터별 base/upset/lose와 김_인턴 used 카드, PNG 크기 검증 재사용, offset 입력, 선택 캐릭터 이미지의 stage slot 바인딩, sidecar import/export.
- **불일치**: stage `render()`는 모든 slot의 `left/top`을 공용 `state.geometry`에서 읽는다. 캐릭터별 `offsets`는 CHARACTER PARTS 카드와 sidecar에만 쓰이므로 이미지가 바뀌어도 캐릭터별 offset은 stage에 반영되지 않는다(`WB-OFFSET-01`).
- **이중 원천**: 기존 SUSPECT STATE PARTS 패널과 `serializePortraitPartsManifest(state.geometry)`가 남아 있어 공용 geometry offset을 별도로 편집·내보낸다. 신규 character sidecar는 `characters[*].offsets`를 사용한다(`WB-SOURCE-02`).
- **레이어**: `SlotDefinition.layer`는 readonly canonical 상수이고 사용자 조작/영속 상태가 없다. 초안의 “기존 layer 값을 편집” 전제는 사실이 아니다(`WB-LAYER-03`).
- **target inspector routing**: X/Y/rotation/shearX/Sx/Sy/aspect/layer/reset/lock은 선택된 `(activeCharacter, part)`의
  `CharacterPartStateV4`만 갱신한다. `isLocked`면 transform drag·키보드·수치 입력·reset·layer 변경을 모두 막고
  unlock만 허용한다. 기존 16-slot 계약과 같이 PNG 교체/drop은 lock 중에도 허용하며 transform 값은 보존한다.
  base/part 전환과 character 왕복 뒤에도 값이 보존되며, legacy SUSPECT STATE PARTS 입력은 제거하거나 이 동일 action을
  dispatch한다. reset은 해당 part의 canonical transform/layer/aspect만 되돌리고 이미지와 다른 캐릭터는 지우지 않는다.
- **legacy shear 보존**: `shearX !== 0`이면 inspector가 `Shx` 실수값과 `LEGACY AFFINE` badge를 항상 표시한다. 일반
  X/Y/rotation/Sx/Sy/aspect/layer 편집과 gizmo drag는 기존 `shearX`를 그대로 보존하며, serializer도 이를 생략하거나
  0으로 normalize하지 않는다. 값 변경은 고급 `Shx` 입력 또는 nonzero shear 경고를 확인한 명시적 해당-part reset에서만
  허용한다. reset 취소, character/part 전환, reload, sidecar export/import는 원래 계수를 byte-stable하게 유지한다.
  `preserveAspectRatio`를 ON으로 바꾸는 것도 shear 제거 동작이므로 `shearX !== 0`이면 별도 확인 전에는 거부하고,
  확인한 경우에만 `shearX=0`과 자매 sizing 계약의 authoritative-axis uniform scale을 함께 적용한다.

워크벤치는 별도 Vite **entry/runtime dependency graph**(`workbench/index.html`)이므로 게임 실행 번들에는 섞이지 않는다.
그러나 `vite.config.ts`의 build input에 게임과 workbench가 모두 들어가므로 **`pnpm build`는 둘 다 검증한다.** “게임
런타임 의존성 격리”와 “빌드 게이트 무관”을 혼동하지 않는다. `src/ui/core/assetDimensions·assetManifest`만 import하는
기존 의존 방향을 유지한다.

### 4.3 승인 portrait sidecar의 런타임 소비 계약

워크벤치 export가 실제 게임에 반영되려면 `asset_manifest.json`과 마찬가지로 **승인본 체크인→검증→app 주입** 경계가
필요하다. 현재 `portrait.ts`는 asset key와 상태만 받아 base/state sprite를 같은 bounds에 놓으므로 sidecar 소비자는 0건이다.

1. sidecar v3 schema, `PORTRAIT_PART_SLOT_BINDINGS`, migration/transform 순수 함수는
   `src/ui/core/portraitPartsManifest.ts`(신규) 한 곳에 두고 workbench와
   `src/app/PortraitPartsRepository.ts`(신규)가 공유한다. `content-io`는 dependency rule상 UI를 읽을 수 없으므로
   이 repository를 그곳에 두지 않는다. UI-core 타입은 engine을 import하지 않는다. 동일 Zod 원본에서
   `schemas/portrait-state-parts.schema.json`을 export하고 `schema:export` byte 동기화 게이트에 추가한다.
2. app repository는 checked-in 12개 승인 JSON을 parse하고 character·part·PNG key·원본 치수·중복·유한 transform·layer를
   검증한다. `portrait_<character>_<part>.png`는 registry 역색인으로 `portrait/<character>/<part>` 3구간 key에
   해석되어야 하며, 파일명과 본문 character/part가 다르거나 실제 PNG가 없으면 실패한다. 게임은 미승인 workbench
   localStorage/data URL을 읽지 않는다.
3. app 계층은 현재 character/state에 필요한 완성 `PortraitPartView[]`를 만들고 `portrait.ts`에 주입한다. UI는 sidecar
   파일이나 engine 타입을 직접 읽지 않는다. v2/missing fallback은 개발 중 호환용
   `offsetX/Y:0, rotation:0, shearX:0, scaleX/Y:1, preserveAspectRatio:true, canonical layer, isLocked:false`의 완전한
   identity state로만 허용하고, production content gate에서는 12개 v3 승인본 누락을 실패시킨다.
4. 전역 anchor는 event/custom-scale 문서의 runtime asset manifest에서 `suspect-base`/`partner-base`만 받는다. sidecar의
   base transform을 그 anchor에 합성한 뒤 upset/lose/used를 base authored 좌표계에서 합성한다. manifest의
   `suspect-state-parts`/`suspect-lose-parts`/`partner-used` transform을 다시 적용해 **이중 이동·이중 스케일**하지 않는다.

sidecar parser와 editor action은 같은 제약을 쓴다. `rotation`은 `[0, 2π)`로 normalize하고, `shearX`는 유한 실수,
`scaleX/scaleY`는
`0 < scale <= 64`다. base layer는 정확히 0, upset/lose/used layer는 portrait-container local 정수 `1..31`이다.
 base의 layer 조작은 비활성화하고 child의 ↑/↓만 이 범위에서 허용한다. `preserveAspectRatio:true`면
`shearX===0 && scaleX===scaleY`를 모두 요구하고 한 축만 편집한다. QR migration 결과 `shearX !== 0` 또는
`scaleX !== scaleY`이면 `preserveAspectRatio:false`로 보존해 `LEGACY AFFINE`/왜곡 경고를 표시하며 true로 위조하지 않는다. false면 비균일
 scale 또는 shear에 대한 왜곡 경고를 표시한다. 합성 뒤 각 축의 logical 크기는 `0.5..4096`이고
회전 AABB가 자기 portrait viewport와 최소 8 logical px 교차해야 한다. NaN/Infinity, 0/음수 scale, 범위 밖 layer,
완전히 화면 밖인 transform은 import/commit 전에 거부한다. local layer는 전역 desk/HUD/overlay layer로 승격될 수 없다.

공유 resolver의 수학 계약은 다음과 같다. anchor rect/rotation은 manifest의 `suspect-base` 또는 `partner-base`, source와
각 part는 512×512다. pivot은 별도 저작 필드가 생기기 전까지 **source center `(256,256)`**로 고정한다. column-vector
행렬을 사용하며 `L(p)`의 offset/rotation/scale은 authored source 좌표계에서 적용한다.

```ts
P = vec2(256, 256)
M_anchor = T(anchor.center) * R(anchor.rotation)
         * S(anchor.width / 512, anchor.height / 512) * T(-P)
Kx(k)    = matrix(1, 0, k, 1, 0, 0) // x-shear coefficient, angle 아님
L(part)  = T(part.offsetX, part.offsetY) * T(P)
         * R(part.rotation) * Kx(part.shearX)
         * S(part.scaleX, part.scaleY) * T(-P)

M_base  = M_anchor * L(base)
M_child = M_anchor * L(base) * L(child) // upset / lose / used
```

base sprite에는 `M_base`, 상태 sprite에는 `M_child`를 적용한다. 회전+비균일 scale 조합은 단일 width/height/rotation으로
분해하면 shear를 잃을 수 있으므로 Pixi `Container` chain 또는 full affine matrix로 표현한다. preview와 runtime은 같은
resolver 결과 행렬을 사용한다. 최종 화면 translation만 `snapPositionToRenderGrid(..., renderScale=2)`로 0.5 logical
grid에 맞추며 matrix의 scale/rotation과 authored 값은 다시 쓰지 않는다. base layer가 먼저이고 child는 local layer와
semantic tie-break(`base < upset < lose < used`)로 stable sort한다.

**legacy affine migration(P0)**: 현 v2/v3의 base/state 슬롯은 각각 독립 rotation과 비균일 scale을 가질 수 있다.
따라서 `M_relative = inverse(M_base) * M_legacyChild`는 일반적으로 shear를 포함하며, offset/rotation/scale만으로 분해하면
렌더가 바뀐다. migrator는 양의 determinant를 가진 `M_relative`를 deterministic QR 분해해
`T · R · Kx(shearX) · S`로 저장하고, 행렬 재합성 오차를 epsilon으로 검증한다. canonical checked-in v2 sidecar는
`shearX=0`으로 올라가지만, 회전+비균일 scale legacy 회귀는 0이 아닐 수 있다. non-finite·non-invertible·허용 크기를
벗어난 행렬은 shear를 버리거나 근사하지 말고 raw backup/read-only 복구 경로로 보낸다. preview, v4 storage,
portrait sidecar 3.0과 runtime이 이 계수를 모두 왕복해야 하며, 임의 TRS 분해로 되돌리지 않는다.

기본 suspect에서 authored `1px`는 투영 전 `0.421875 logical`이고 render snap 뒤 `0.5 logical`로 보일 수 있다.
이는 authored 값을 0.5로 오해하거나 덮어쓰는 것이 아니다. v2 workbench geometry→v4 migration은 반대 변환을
`Math.round` 없이 수행해 유한 authored offset을 보존하고, preview와 runtime이 같은 snap 결과를 내야 한다.
위 `snapPositionToRenderGrid`는 최종 x/y만 0.5 grid에 맞춘다. width/height를 독립 반올림해 authored aspect/scale을
바꾸지 않으며, 크기 스냅이 필요한 unlocked custom-size 슬롯만 자매 문서 §2.2의 명시적 정책을 사용한다.
비직각 회전은 event/custom-scale 문서와 동일하게 NEAREST만 유지하고 픽셀 퍼펙트라고 주장하지 않으며 경고한다.

---

## 5. 기능 5 — 초상 상태 전환 셰이크 애니메이션

> **현재 상태: 위젯·전환 감지·화면 배선 완료, bootstrap 제출 경계의 직접 자동화와 실브라우저 검증은 잔여.**

### 5.1 핵심 제약: 전환은 화면이 아니라 bootstrap만 안다

심문 화면은 제출마다 통째로 리마운트되므로 이전 `suspectStatePart`는 새 화면 인스턴스에 존재하지 않는다. 구현은 비교 로직을 `src/app/suspectTransition.ts`의 순수 함수 `detectSuspectTransition()`으로 분리하고 bootstrap이 이전 mark를 보관한다:

```ts
// bootstrap.ts — mountInterrogation 스코프 밖(모듈 mount 함수 상위)에
let lastSuspectStatePart: SuspectStatePart | undefined;
let lastSuspectEncounterId: string | undefined;

// mountInterrogation() 내부, setAutoplayScene 이후의 실제 의미:
const part = screenModel.suspectStatePart;
const candidate =
  lastSuspectEncounterId === active.encounterId &&
  lastSuspectStatePart !== undefined &&
  lastSuspectStatePart !== part
    ? { from: lastSuspectStatePart, to: part }
    : undefined;
const transition = candidate !== undefined && isPortraitShakeEdge(candidate)
  ? candidate
  : undefined;
lastSuspectStatePart = part;
lastSuspectEncounterId = active.encounterId;
if (transition !== undefined) controller.playSuspectTransition(transition);
```

인카운터가 바뀌면 리셋(첫 마운트에 셰이크 금지). `openCurrentNode()`에서 `lastSuspectStatePart = undefined` 초기화.
`isPortraitShakeEdge`의 exhaustive 허용 집합은 `{base→upset, upset→lose}` 두 개뿐이다. `upset→base`,
`lose→upset/base` 같은 reverse와 `base→lose` skip edge는 상태 자체는 정상 반영하되 portrait-local/lose screen 연출을
재생하지 않는다. detector는 현재 모든 unequal edge를 반환하므로 target 구현에서 이 whitelist를 순수 함수와 테스트로 고정한다.

### 5.2 위젯 업그레이드 (`src/ui/widgets/portrait.ts`)

`createPortrait`의 반환은 `Container` → `PortraitController`로 승격되었다. 실제 이름은 초안의 `SuspectPortraitController`가 아니라 `PortraitController`다:

```ts
export interface PortraitController {
  readonly view: Container;
  readonly statePart: SuspectStatePart;
  /** 허용된 두 portrait-local edge만 0.4초·maxAbs 10px 이하로 수평 진동. */
  playTransitionShake(to: SuspectStatePart): void;
  update(deltaMS: number): void;
  readonly shaking: boolean;
}
```

**진동 사양** (순수 함수로 분리해 단위 테스트: `portraitShakeOffset(elapsedMs, to)`). 원 요구의
“base→upset 및 upset→lose 모두 0.4초, 최대 ±10px”은 exact peak 도달이 아니라 상한 계약이다. 기존 upset 값을
유지하고 lose만 같은 profile로 낮추는 최소 target은 다음과 같다:

```
duration = 400ms
coefficient = 10
offsetX(t) = round( coefficient · sin(t/duration · π · 5) · (1 - t/duration) ) // 감쇠 진동, 정수 반올림
observedPeak = 9px                                 // 1ms 전수 기준; maxAbs≤10 충족
적용: view.position.x = baseX + offsetX          // baseX는 마운트 시 캡처
종료: offsetX=0 복원, shaking=false
```

현재 `amplitude:10/12`의 밀리초 전수 peak는 upset 9px, lose 11px이다. upset은 이미 합격이고 lose만
`durationMs:400, amplitude:10`으로 맞춘다. 필드명을 계속 `amplitude`로 두더라도 관측 peak가 아니라 곡선 계수임을
주석으로 명시하며, 두 허용 edge 모두 400ms 뒤 정확히 baseX로 복원한다. 향후 곡선을 바꿔도 수용 기준은
`exact 10`이 아니라 전체 샘플의 `maxAbs≤10`이다.

**lose 전환 추가 연출**: “lose가 더 강함”은 portrait-local 진폭/시간을 늘려 구현하지 않는다. 화면 컨트롤러가
content scene shake와 `createPulseRings()`/pixel-wave를 병행해 차등화한다. coercion 연출과 동일한 primitive를
재사용하되 별도 `loseShake`/`loseRings` controller로 관리하고 초상 자체는 항상 ±10px 이내다.

**통합**: `createInterrogationScreen`이 `playSuspectTransition(transition)` 공개 메서드 추가 → 허용 edge일 때만 내부에서 `portrait.playTransitionShake(transition.to)` + upset→lose면 화면 셰이크. 티커는 기존 `controller.update`에 `portrait.update` 합류.

**전환 규칙 회귀 고정**: `deriveSuspectStatePart` 경계(§0.1: ratio ≤ 0.4 → upset, composure ≤ 0 ∨ confessed → lose)는 그대로 신뢰한다 — 엔진 변경 없음. 다만 상태 산출과 연출 edge whitelist는 별개이며 reverse/skip 상태 변화는 무연출이다.

**자동화 경계**: `tests/ui/portrait-shake.test.ts`는 곡선과 컨트롤러를, `tests/app/suspect-transition.test.ts`는 encounter 경계를, `tests/ui/interrogation-screen-juice.test.ts`는 upset/lose 화면 효과를 검증한다. 다만 bootstrap의 실제 제출 callback을 통과하는 테스트는 없으므로 `APP-WIRING-05`가 완료될 때까지 “통합 완료”는 코드 대조 수준이다.

---

## 6. 교차 관심사

| 관심사 | 처리 |
|---|---|
| 오토플레이 호환 | 연출은 새 scene을 만들지 않고 `eventMode='none'`인 티커 오버레이라 watchdog/입력 계약과 공존한다. 현행 `setAutoplayScene({displayStrings: collectAutoplaySceneStrings(screenModel)})` 뒤 imperative 배너 주입은 문자열을 놓친다(`AUTO-FEEDBACK-02`). target은 §2.3.1의 app-owned monotonic presentation queue, preview-before-submit, render-tick latch, collector ack로 scene 전환 뒤에도 시각 표시와 문자열 scan을 각각 증명한다. |
| 세이브/리플레이 | UI 연출은 비영속이다. 카드 modifiers는 입력 재실행 시 결정적으로 적용되지만 coordinator JudgmentLog의 `resourceEffects`는 resolver delta만 기록하고 card modifier의 실제 순변화를 기록하지 않는다. 로그를 “판정 원인값”으로 유지할지 “실제 상태 변화”까지 확장할지 명시해야 하며, 후자를 기대하면 현재 로그는 불충분하다. |
| i18n | 현재 `judgment.feedback.*` 13종(제출 후 11종 + preview 2종)은 app 조립 테스트와 string coverage로 검증한다. 고정 개수만 단언하지 말고 필수 key 집합과 미치환 placeholder/raw key 부재를 검증한다. 강압 플로팅 레이블과 모달 닫기 힌트는 알려진 UI literal 예외(`I18N-JUICE-01`, `I18N-MODAL-02`). |
| 성능 | 연출은 프레임당 Graphics 재그리기 최소화(딤·링은 알파/스케일 트윈만, 지오메트리 재구성 금지). 셰이크는 position 변경만 |

---

## 7. 구현 현황과 잔여 종료 순서

| 단계 | 상태 | 실제 구현 지점 | 잔여 |
|---|---|---|---|
| **S1 카드 효과** | **완료** | `EncounterCoordinator.ts`, `tests/judgment/card-effects.test.ts` | `ResolutionEffectApplier` type 분기 추가는 불필요. 설명-수치 동기화 테스트만 선택 잔여 |
| **S2 카드 3분할** | **부분 완료** | `cardLayout.ts`, `cardArtwork.ts`, `cards.json`, `strings.ko.json` | `INTENT-I18N-08`, `CARD-VISUAL-06`, `I18N-MODAL-02`, 카드별 art key 배선 여부 결정 |
| **S3 판정 피드백** | **부분 완료** | repository + app assembler + `judgmentBanner.ts` + screen/bootstrap | `PREVIEW-CLEAR-03`, `PREVIEW-SEMANTICS-10`, `BANNER-LIFECYCLE-09`, `AUTO-FEEDBACK-02`, `APP-WIRING-05` |
| **S4 강압 연출** | **부분 완료** | `shake.ts`, `punishJuice.ts`, screen/bootstrap | `I18N-JUICE-01`, `COERCION-DELTA-04`, 브라우저 시각 검증 |
| **S5 초상 셰이크** | **부분 완료** | `portrait.ts`, `suspectTransition.ts`, screen/bootstrap | 허용 edge 2개만 400ms/maxAbs≤10px로 `PORTRAIT-AMP-07` 수정, reverse/skip 무연출, `APP-WIRING-05`, 브라우저 시각 검증 |
| **S6 캐릭터 워크벤치** | **부분 완료** | `workbench/model.mts`, `main.mts`, `index.html`, `style.css` | `WB-OFFSET-01`, `WB-SOURCE-02`, `WB-LAYER-03`, `WB-SIDECAR-04`, `WB-RUNTIME-05` |

**권장 종료 순서**: 먼저 `WB-OFFSET-01`+`WB-SOURCE-02`+`WB-RUNTIME-05`를 하나의 모델/소비 경계로 닫고,
병렬로 `I18N-JUICE-01`+`I18N-MODAL-02`+`COERCION-DELTA-04`를 닫는다. 이후
`PREVIEW-CLEAR-03`+`APP-WIRING-05`와 `AUTO-FEEDBACK-02`를 추가하고 마지막에 실제 브라우저 시각/워크벤치
왕복을 수행한다. 동일 파일을 공유하는 screen/bootstrap 변경은 직렬로 한다.

---

## 8. Verification & Test Plan

### 8.1 현재 자동화 근거와 공백

| 테스트 | 상태 | 단언 / 한계 |
|---|---|---|
| `tests/judgment/card-effects.test.ts` | **존재** | 제출을 통한 effect 적용, runtime sentinel, invalid 미적용, shipped vocabulary. 한국어 설명-수치 동기화는 미검증 |
| `tests/ui/card-artwork.test.ts` | **존재** | CP/일러/설명 geometry와 authored font 환산. 실제 font glyph와 14종 overflow는 미검증 |
| `tests/ui/card-widget-interactions.test.ts` | **존재** | hover/drag/drop/modal pointer 계약. modal dismiss hint의 catalogue/app 주입은 미검증(`I18N-MODAL-02`) |
| card intent presentation 신규 회귀 | **미존재** | `ACTION_INTENTS`(CROSS_CHECK 포함)→10개 `intent.*` key/localized label/art/role exhaustive projection, fan/modal 동일 label, `AUTOPLAY_VISIBLE_STRING_FIELDS`의 `intentLabel` 수집, raw developer token 0을 검증해야 함 |
| `tests/app/judgment-feedback.test.ts` | **존재** | 전 resolution code tone, missing scope 우선, 폴백, raw key 부재, 현재 13개 feedback 필수 key와 preview missing/ready |
| `tests/content-io/judgment-ui-map-repository.test.ts` | **존재** | 실 JSON, 404 degrade, invalid map 거부 |
| `tests/ui/judgment-banner.test.ts` | **존재** | bounds/tone/ellipsis/clear. 실제 Galmuri 폭은 미검증 |
| `tests/ui/punish-juice.test.ts` | **존재** | timeline, 정수 shake, rings/float, restart/destroy, pointer 비차단 |
| `tests/ui/portrait-shake.test.ts` | **존재** | 감쇠·경계·lose 강화·재시작·restoration. target 변경 뒤 두 허용 edge duration=400ms, 1ms 전수 `maxAbs≤10`, 종료 baseX 복원을 추가해야 함. exact peak 10은 단언하지 않고 lose 차등은 screen effect에서 검증 |
| `tests/app/suspect-transition.test.ts` | **존재** | 동일 encounter 변화, 최초/교체/동일 상태 무시, 40%/lose 경계에 더해 base→upset/upset→lose만 허용하고 reverse/skip edge는 무연출인지 고정 |
| `tests/ui/interrogation-screen-juice.test.ts` | **존재** | 화면 controller의 배너/강압/upset/lose 통합. bootstrap 제출 경로는 미통과 |
| `tests/ui/workbench-character-parts.test.ts` | **존재** | roster/이미지/offset/v2→v3/12 sidecar byte round-trip. target은 required part materialization, 다른 character used 거부, frozen state-slot의 user-authored transform 소비·global hit/action/user-state export 0과 16-slot canonical sample entry 1, STAGE_ANCHOR/CHARACTER_PART 한 pointer→한 action, DOM preview/layer를 추가 검증해야 함 |
| portrait sidecar v3/runtime 신규 회귀 | **미존재** | v2→v3 렌더 불변, required base/upset/lose(+김_인턴 used) materialization과 image 누락 승인-export 거부, finite authored offset, rotated+nonuniform legacy의 QR `shearX` 재합성 오차 0·strict round-trip, 일반 inspector/gizmo 편집·전환·reload 시 nonzero shear 보존 및 고급 입력/확인 reset만 변경, aspect=true이면 shear=0+uniform scale·legacy shear는 false 경고·ON 토글 확인 전 무변경, used/transform/aspect/layer/lock, JSON Schema byte sync, repository 12종, role+part binding, app→portrait DTO, preview/runtime affine projection 및 이중 transform 방지를 검증해야 함 |
| `tests/content/strings-coverage.test.ts` | **존재** | content가 참조하는 키와 기술 ID 누출 검사. UI literal 검출기는 아님 |
| bootstrap/autoplay/browser 신규 회귀 | **미존재** | `PREVIEW-CLEAR-03`, explicit edit dispatcher의 PREVIEW/RESOLUTION clear→재평가, 중립 preview, 정상 foreground의 모든 resolution 1 render tick+terminal 700ms dwell, 1500ms monotonic watchdog의 no-render degraded 예외 telemetry·단일 completion·destroy cancellation, degraded 뒤에도 queue scan/ack 전 action 0, preview-before-submit, `APP-WIRING-05`, `AUTO-FEEDBACK-02`, `INTENT-I18N-08`, `CARD-VISUAL-06`, `WB-OFFSET-01`을 닫아야 함 |

### 8.2 게이트

`package.json`의 실행 계약은 Node `>=22.13 <23`, pnpm `11.18.0`이다. 호스트 기본 Node가 24라면 경고를
무시하지 말고 Node 22 환경으로 전환한 뒤 아래 명령을 실행한다.

```bash
# 최종 인수: package.json이 정의한 전체 게이트. 파일/테스트 개수는 고정하지 않는다.
cd dungeon-dossier
corepack pnpm check

# check에 포함되지 않는 확장 결정성/스키마 게이트
corepack pnpm schema:export
corepack pnpm simulate:full

# 설계 작업 중 빠른 표적 회귀
corepack pnpm vitest run \
  tests/judgment/card-effects.test.ts \
  tests/app/judgment-feedback.test.ts \
  tests/app/suspect-transition.test.ts \
  tests/content-io/judgment-ui-map-repository.test.ts \
  tests/ui/card-artwork.test.ts \
  tests/ui/judgment-banner.test.ts \
  tests/ui/punish-juice.test.ts \
  tests/ui/portrait-shake.test.ts \
  tests/ui/interrogation-screen-juice.test.ts \
  tests/ui/workbench-character-parts.test.ts
```

`pnpm check`는 lint/arch/typecheck/test/content/palette/smoke/build를 포함하지만 `schema:export`와 `simulate:full`은 포함하지 않는다. 따라서 세 명령을 모두 `dungeon-dossier/`에서 실행한다. 테스트 파일·case 총수는 구현 중 변하므로 문서 계약으로 고정하지 않고 각 실행 결과에서 동적으로 보고한다. 표적 테스트만 통과한 상태를 최종 완료로 보고하지 않는다.

### 8.3 수동 검증 시나리오

1. 1280×800 출력에서 14종 카드 각각을 팬/모달로 열어 CP·title·intent·description이 잘리거나 겹치지 않고 hover/drag hit area가 유지되는지 확인한다.
2. 직접 모순·근거 부족·무관 증거·진실 공격·무효 행동을 각각 제출해 tone, 진술/증거 인용, scope 우선 detail, 말줄임을 확인한다.
3. coercion 정상 +15, 95→100의 실제 +5, gauge 최대치, 음수 modifier 완전 상쇄를 각각 재현하고 실제 순증가만 숫자/연출에 나타나는지 확인한다.
4. 평정 41→40, upset→lose, encounter 교체와 upset→base/base→lose를 재현해 첫 마운트/교체/reverse/skip에는 shake가 없고 두 허용 edge만 400ms·maxAbs≤10 정수 픽셀로 흔들린 뒤 원위치하는지 확인한다.
5. video autoplay 15/15 완주뿐 아니라 각 적용 가능한 encounter에서 preview-before-submit과 모든 resolution의
   `presentationRevision`이 증가하고, 최소 한 render tick 뒤 collector ack 전까지 문자열이 유지되며 raw key가 없는지 확인한다.
   별도 throttled/no-render fixture는 1500ms monotonic watchdog 뒤 `JUDGMENT_DWELL_DEGRADED`를 1회 기록하고 무한 대기 없이 진행하며, 정상 foreground fixture의 degraded count는 0이어야 한다.
6. 워크벤치에서 물컹이와 드워프에 서로 다른 upset offset을 넣고 전환 왕복한다. stage preview·신규 sidecar·runtime resolver가 선택 캐릭터의 동일 좌표를 보여야 한다. legacy state slot은 migration 뒤 frozen/read-only이고 global gizmo hit·preview 소비·user-state export가 모두 0이며 canonical sample 값이 변하지 않아야 한다. 현재는 실패가 예상되며 `WB-OFFSET-01`/`WB-SOURCE-02` 종료 조건이다.
7. canonical v2 12 sidecar를 v3로 migration한 뒤 렌더 불변을 확인하고, **sidecar 자체**의 image refs·유한 source-pixel offset·rotation·`shearX`·scale/aspect·layer/lock과 김_인턴 used가 strict round-trip되는지 확인한다. 별도로 rotation+비균일 scale이 다른 legacy base/state 한 쌍을 migration해 relative matrix의 QR 분해→재합성이 epsilon 내 동일하고 shear를 0으로 버리지 않는지 검증한다. suspect usage는 512→216, partner usage는 512→88 투영과 0.5 render snap이 preview/runtime에서 같고 authored 값은 변하지 않아야 한다. `activeCharacter` 보존은 별도의 workbench localStorage v4 round-trip에서 검증하며 sidecar에 기대하지 않는다. malformed/duplicate/unknown-character/role-part 불일치/본문-파일명 불일치는 거부한다.

---

## 부록 A. 파일별 변경 총괄표

| 파일 | 기능 | 신규/수정 |
|---|---|---|
| `src/ui/widgets/cardLayout.ts` | F1 | 수정 (illust rect 우측 정렬 + `CARD_COPY_RECTS`) |
| `src/ui/widgets/cardArtwork.ts` | F1 | 수정 (CP 뱃지 좌상단·설명 상시 렌더; target은 raw intent 대신 localized label+visual role 사용) |
| `src/app/cardIntentPresentation.ts` / `src/app/createEncounterSession.ts` | F1 target | 신규/수정 필요 (`ACTION_INTENTS` 10종 label key+role+art definition과 localized view projection) |
| `src/ui/screens/interrogation/model.ts` / `createInterrogationScreen.ts` | F1 target | 수정 필요 (`intentLabel`·`visualRole`·우선 적용된 art만 소비; UI-local raw intent map 제거) |
| `src/app/autoplayPort.ts` | F1 target | 수정 필요 (`AUTOPLAY_VISIBLE_STRING_FIELDS`에 `intentLabel` 추가) |
| `src/engine/encounter/EncounterCoordinator.ts` | F1 | 수정 (`#applyCardEffects`·submission target binding·effect reducer) |
| `src/engine/resolution/ResolutionEffectApplier.ts` | F1 | 변경 대상 아님 — 유효 card effects를 `appliedCardEffects`로 전달하는 경계 |
| `content/common/cards.json` | F1 | 수정 (modifiers 저작) |
| `src/content-io/JudgmentUiMapRepository.ts` | F2 | **신규** |
| `src/app/judgmentFeedback.ts` | F2 | **신규** |
| `src/ui/screens/interrogation/model.ts` | F2 | 수정 (`JudgmentFeedbackView`) |
| `src/ui/screens/interrogation/judgmentBanner.ts` | F2 | **신규** (bounds·tone·ellipsis) |
| `src/ui/screens/interrogation/createInterrogationScreen.ts` | F2·F3·F5 | 수정 (배너·`showJudgmentFeedback`·`playCoercionRise`·`playSuspectTransition`·티커 합류) |
| `src/ui/screens/interrogation/punishJuice.ts` | F3 | **신규** |
| `src/ui/core/shake.ts` | F3·F5 | **신규** (정수 픽셀 감쇠 shake controller) |
| `src/ui/widgets/portrait.ts` | F5 | 수정 (컨트롤러 승격 + `playTransitionShake`) |
| `src/app/suspectTransition.ts` | F5 | **신규** (동일 encounter 상태 전환 감지) |
| `src/app/bootstrap.ts` | F2·F3·F5 | 수정 (uiMap 로드·피드백 호출·강압 연출 호출·전환 감지 상태) |
| `content/common/strings.ko.json` | F1·F2 | 수정 (`judgment.feedback.*` 현재 13키, 카드 설명, target `intent.*` 10키) |
| `workbench/model.mts` | F4 | 수정 (v3 상태·캐릭터 레지스트리·마이그레이션·사이드카 왕복) |
| `workbench/main.mts` / `index.html` / `style.css` | F4 | 수정 (드롭다운·동적 파츠 슬롯·가져오기·패널 스타일) |
| `src/ui/core/portraitPartsManifest.ts` / `schemas/portrait-state-parts.schema.json` / `src/app/PortraitPartsRepository.ts` | F4 target | **신규 필요** (v3 단일 schema/export·migration·transform resolver·승인 sidecar 런타임 로드; content-io→ui 금지 준수) |
| app portrait presentation / `src/ui/widgets/portrait.ts` | F4 target | 수정 필요 (UI-local part DTO 주입·transform/layer 적용; state slot manifest transform 이중 적용 금지) |
| 기능별 테스트 | 전체 | 실제 목록과 공백은 §8.1을 기준으로 하며 개수는 고정 계약으로 삼지 않음 |

## 부록 B. 명세 대비 조정 사항 (근거 포함)

| 명세 원문 | 조정 | 근거 |
|---|---|---|
| "카드에 `cpCost`·`effect` 속성 명시" | 스키마 신설 대신 **기존 `cost.cp`·`modifiers` 재사용 + 런타임 배선 검증** | §0.1 — 스키마 이미 존재, 이중 정의 방지 |
| "설명 fontSize: 8" | 저작 공간 fontSize 40 (팬 0.2배 = 화면 8px) | §1.2 주의 — 저작/화면 좌표계 구분 |
| "카드별 아트 key 신설" | 현행 registry key는 intent별 `card/질문/일러` · `card/모순/일러` · `card/압박/일러`; 카드별 key는 콘텐츠/뷰모델 배선부터 별도 설계 | `createInterrogationScreen.ts`의 art key 선택과 `InterrogationCardView.artAssetKey` |
| "cardFan.ts·cardDetailModal.ts (신규)" | 기존 파일 증축 | 두 파일 모두 이미 구현·가동 중 |
| "`src/engine/resolution/`에서 모순 텍스트" | 조립은 **app 계층**(`judgmentFeedback.ts`) | UI↛engine 아키텍처 게이트, 엔진은 이미 필요한 축·스코프를 전부 산출 |
| "강압도 +15 고정 표기" | 현행 resolver-delta fallback을 폐기하고 **모든 효과·clamp 뒤 실제 gauge 순증가만 표기** | 정상 +15, 95→100은 +5, 상쇄·포화는 0으로 고정하는 `COERCION-DELTA-04` 정책(§3.1) |
| "12종: …오크… 등" | 실측 12종 확정 명단(켄타우로스 포함) | `assets/portraits/` 사이드카 12개 실측 |
| "`portrait.ts` 셰이크" | 위젯 + **bootstrap 전환 감지** 2원 구조 | 화면이 제출마다 리마운트되어 위젯 단독으론 전환을 알 수 없음(§5.1) |
| "워크벤치 v3" | 현행 document는 v3, 공동 target은 **단일 v4**. storage key `.v2` 유지. portrait sidecar는 2.0→3.0(카드), asset manifest는 2.0→3.0(이벤트), save는 1→2(이벤트) | 숫자가 같아도 독립 축이며, 카드용/event용 서로 다른 workbench v4 shape를 만들지 않음(§4.1) |
| "캐릭터 전환 시 이미지·offset 리바인드" | 이미지는 구현, offset stage 반영은 미구현 | `main.mts` stage render가 공용 `state.geometry`를 사용 (`WB-OFFSET-01`) |
| "김_인턴 used 파츠 왕복" | workbench/localStorage PNG 관리만 구현; portrait sidecar v2.0에서는 제외. **target v3에는 used + 모든 character-part offset/rotation/shear/scale/layer를 포함** | §4.1 범위 결정; v2.0 `state_parts`는 upset/lose 두 상태만 표현 |
