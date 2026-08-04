# 🛠 던전 수사 조서 — Codex 실행 태스크 명세서

| 항목 | 내용 |
|---|---|
| 버전 | v1.0 |
| 작성일 | 2026-08-04 |
| 대상 저장소 | `dungeon-dossier/` |
| 검증 기준 시점 | 테스트 **388 passed (56 files)**, `pnpm check` 통과 상태 |
| 이 문서의 지위 | **실행 정본.** `docs/gap_analysis_and_completion_roadmap.md`와 `docs/phase/phase7_*.md`의 갭 목록은 실측과 불일치하므로 **이 문서가 우선한다** |

---

## ⚠️ 0. 먼저 — 기존 갭 문서를 신뢰하지 말 것

`gap_analysis_and_completion_roadmap.md`와 dn   `phase7_comprehensive_gap_audit_and_final_completion.md`가 "미구현"으로 지목한 18개 항목 중 **10개는 이미 구현되어 있다.** 그 문서들을 그대로 실행하면 이미 동작하는 코드를 덮어써서 388개 테스트를 깨뜨리게 된다.

### 0.1 두 문서가 틀린 항목 (실측 반증)

| 문서 주장 | 실측 | 반증 근거 |
|---|---|---|
| A-1/A-2: ep001·ep004 "case.json 기본 구조만, 대사 미비" | **거짓** | 각 사건: claims 18 · inquiry_routes 6 · evidence 6 · proof_rules 6 · encounters 3 · events_noncombat 2. 대사 파일 3개씩(약 4.2KB) 존재 |
| A-4: inquiry_routes "빈 배열 또는 최소 샘플" | **거짓** | 3사건 합계 **18개** 존재 |
| A-5: 폴백 대사 "샘플만 존재" | **거짓** | **365문장** — 정본 목표 260~410 범위 안 |
| A-6: `content/ai-cache/` ".gitkeep" | **거짓** | `tutorial-slime-full-statement.json` 존재 |
| B-1: `RunCoordinator` 부재 | **거짓** | `RunState.ts` 571줄 + `createRunSession.ts` 130줄 + `gameRunState.ts` 223줄. 저장·복원까지 배선됨 |
| B-2: RewardSystem "연동 필요" | **거짓** | `RunSession.finishEncounter()` → 시드 기반 추첨 → `claimReward()` → 저장까지 연결 |
| B-3: GradeEvaluator "수식만 존재" | **거짓** | `encounterGradeMetrics()` → `RunSession` → `gradeHistory` 배선 완료 |
| B-4: EndingEvaluator "조건 정의만" | **거짓** | `endingIdForRun()` → `GAME_ENDING_FORMULA` → 엔딩 화면까지 연결 |
| C-1~C-4: 4개 화면 "기본 모델/껍데기만" | **거짓** | strip 84줄 · event 118줄(**A/B/C 3패턴 전부 구현**) · reward 46줄 · ending 46줄. 전부 `bootstrap.ts`에서 `setScene` 마운트됨 |
| 27셀 시뮬레이터가 합성 데이터 | **거짓** | `routeSimulator.ts`가 실제 `case.json` 3개 + `EncounterCoordinator`를 사용 |

### 0.2 두 문서가 **놓친** 진짜 갭

아래 4개는 어느 문서에도 없지만 **게임 완결에 가장 치명적**이다.

| 실제 갭 | 실측 | 영향 |
|---|---|---|
| **9전투 기믹 데이터 0건** | 전 encounter의 `modifiers: []` | `ModifierSystem` 1,036줄이 실콘텐츠에서 한 번도 안 돔. 물컹이 잠금·하피 QTE·미노 돌진·고블린 반사·오크 파쇄·서큐버스 봉인·드워프 셔플·사이클롭스 CP·용사 절차가 **전부 부재**. QA9·QA10·QA11이 실데이터로 재현 불가 |
| **flag_hooks 0건** | 3사건 모두 `flag_hooks: []` | `flags.json`은 있으나 사건이 플래그를 발생·소비하지 않음. F-01~F-13 연계 QA가 실데이터로 못 돎 |
| **보스 페이즈 부재** | 전 encounter `rounds: 1`, `flow_nodes: 1` | 보스 3전투에 페이즈 전이가 없음. T-6(말 바꾸기 → 자체 모순)이 성립 불가 |
| **오디오 완전 미배선** | `AudioPlayer` 29줄이 `src/app`·`src/ui` 어디서도 호출 안 됨 | SFX 12·BGM 4+2 전부 무음. `ENDING_BGM_MUTE` 연출 키가 테이블에만 있고 실행 경로 없음 |

---

## 1. 실행 전 상태 확인 (필수)

작업 시작 전 반드시 실행하고, 아래 값과 다르면 이 문서의 전제가 깨진 것이므로 중단하고 보고할 것.

```bash
cd dungeon-dossier
corepack pnpm install
corepack pnpm test          # 기대: Test Files 56 passed / Tests 388 passed
corepack pnpm check         # 기대: 전 단계 통과
```

현재 콘텐츠 실측값 (기준선):

```
전투 9 | modifiers 0 | rounds 총합 9 | flow_nodes 각 1
증거 18 | flag_hooks 0 | 비전투이벤트 7 | 질문경로 18 | 폴백대사 365문장
```

---

## 2. 절대 규칙 (위반 시 CI 실패)

1. **`src/engine/**`에 콘텐츠 ID 리터럴 금지** — `case_`·`clm_`·`ev_`·`ent_`·`enc_` 접두 문자열. `tests/arch/no-hardcoded-content-ids.test.ts`가 감시.
2. **`src/engine/**`에서 금지 API** — `pixi.js`·`howler`·`window`·`document`·`fetch`·`Date.now`·`Math.random`.
3. **`src/ui/**`에서 `src/engine/**` 직접 import 금지** — `dto`를 통해서만. dependency-cruiser가 감시.
4. **상태 변경 지점은 2곳뿐** — `ResolutionEffectApplier`, `ModifierSystem`. 세 번째를 만들지 말 것.
5. **기존 388개 테스트를 수정하지 말 것.** 테스트가 깨지면 구현이 틀린 것이다.
6. **기믹은 Effect 카탈로그 조합만.** 자유 스크립트·전투 전용 코드 분기 금지.

---

## 3. 태스크

각 태스크는 독립 실행 가능하며 완료 조건에 검증 명령이 포함된다. **T1 → T2 → T3 순서를 지킬 것** (T4 이후는 병렬 가능).

---

### T1. 9전투 기믹 데이터 작성 ★최우선

**목표** — `ModifierSystem`(구현 완료, 1,036줄)이 실제 사건 데이터로 구동되게 한다. **코드는 한 줄도 고치지 않는다. JSON만 추가한다.**

**대상 파일**
- `content/cases/tutorial/case.json` → `encounters[].modifiers`
- `content/cases/ep001/case.json` → `encounters[].modifiers`
- `content/cases/ep004/case.json` → `encounters[].modifiers`

**스키마** (`src/engine/domain/schemas/encounter.ts` `EncounterModifierSchema`, strictObject — 필드 누락·오타 시 로드 거부)

```jsonc
{
  "modifier_id": "mod_<encounter>_<name>",
  "trigger": "ON_TURN_START",
  "condition": null,
  "effect": {
    "type": "ADD_TIMER",
    "target_selector": { "scope": "CLAIM", "count": 1, "selection": "DETERMINISTIC_BY_INDEX" },
    "duration_turns": 2
  },
  "counterplay": { "allowed_intents": ["CLARIFY"], "partner_skills": [], "always_available": true },
  "activation_limit": 3,
  "priority": 10
}
```

**허용 `trigger` 11종** — `ON_ENCOUNTER_START` · `ON_TURN_START` · `ON_ACTION_SELECTED` · `ON_ACTION_SUBMITTED` · `ON_RESOLUTION` · `ON_CLAIM_REVEALED` · `ON_CLAIM_CONFIRMED` · `ON_DIRECT_CONTRADICTION` · `ON_COMPOSURE_THRESHOLD` · `ON_EVIDENCE_USED` · `ON_TURN_END`

**허용 `effect.type`** — `MODIFIER_EFFECT_TYPES`(`src/engine/encounter/ModifierSystem.ts:47`)의 22종만.

**`target_selector.selection`** — `DETERMINISTIC_BY_INDEX` · `HIGHEST_RESISTANCE` · `MOST_RECENT` · `SEEDED_RANDOM`. **무작위는 `SEEDED_RANDOM`만 허용**(결정론).

**작성할 9전투 기믹** (정본 §6.4 표 그대로)

| 전투 | trigger | effect.type | counterplay |
|---|---|---|---|
| `enc_tutorial_slime` [누가] 잠금 | `ON_ENCOUNTER_START` | `LOCK_CLAIM` | 파트너 스킬 / 진실 2개 확인 |
| `enc_tutorial_harpy` [무엇을] | `ON_TURN_START` | `TRIGGER_QTE` | QTE 성공 → 증거 등급 A |
| `enc_tutorial_minotaur` (보스) | `ON_COMPOSURE_THRESHOLD` | `CHANGE_PHASE` | CP 1 보존 → 회피 |
| `enc_ep001_goblin` [어떻게] | `ON_RESOLUTION` | `APPLY_COERCION` (반사 2배) | 절차 고지 카드, PRESSURE 자제 |
| `enc_ep001_orc` [언제] | `ON_TURN_START` | `ADD_TIMER` + `DAMAGE_EVIDENCE` | 파트너 「전원 코드 뽑기」, 조기 제출 |
| `enc_ep001_succubus` (보스) | `ON_ENCOUNTER_START` | `LOCK_CARD` + `ADD_TIMER` | 「현실 확인」, 이중 장부 |
| `enc_ep004_dwarf` [어디서] | `ON_DIRECT_CONTRADICTION` | `DISTORT_CLAIM_VIEW` (×2) | `CLARIFY` |
| `enc_ep004_cyclops` [왜] | `ON_ENCOUNTER_START` | `REDUCE_CP` (max 2) | 「증인 보호 등록」 → CP 3 복구 |
| `enc_ep004_fallen_hero` (보스) | `ON_TURN_START` | `SEAL_EVIDENCE` | 파란 도장, 교차 검증 |

**주의 — 해결 경로 보존**: `REMOVE_EVIDENCE`·`DAMAGE_EVIDENCE`를 쓰는 오크 기믹은 파쇄 후에도 대체 조합이 살아 있어야 한다(QA10). `pnpm content:validate`의 T2 규칙 P-3가 이를 검사하므로, 오크 전투에 **간접 조합용 증거를 1개 이상 추가**해야 통과한다.

**완료 조건**

```bash
# 1) 기믹 총합 9개 이상
node -e "const fs=require('fs');let m=0;for(const c of fs.readdirSync('content/cases')){const p='content/cases/'+c+'/case.json';if(!fs.existsSync(p))continue;for(const e of JSON.parse(fs.readFileSync(p,'utf8')).encounters)m+=e.modifiers.length}console.log('modifiers:',m)"
# 기대: modifiers: 9 이상, 전 encounter가 최소 1개 보유

corepack pnpm content:validate   # T1~T3 전 규칙 통과 (특히 P-3 해결 경로 생존)
corepack pnpm test               # 388개 유지 + 신규 테스트
```

**추가할 테스트** — `tests/content/encounter-modifiers.test.ts`
- 9개 전투 각각이 `modifiers.length >= 1`
- 모든 `effect.type`이 `MODIFIER_EFFECT_TYPES`에 포함
- `target_selector.selection`에 `SEEDED_RANDOM` 외 무작위 값 없음
- 각 modifier의 `counterplay.allowed_intents`가 빈 배열이 아니거나 `always_available === true` (반격 불가 기믹 금지)

---

### T2. flag_hooks 연계 데이터 작성

**목표** — `flags.json`의 F-01~F-13이 사건에서 실제로 발생·소비되게 한다. **엔진 분기 없이 데이터만으로** 연계가 성립해야 한다.

**대상 파일** — 3개 `case.json`의 `flag_hooks` 배열

```jsonc
{
  "flag_id": "F-05",
  "set_by": [
    { "encounter": "enc_tutorial_slime",  "outcome": "COERCED_CONFESSION" },
    { "encounter": "enc_tutorial_harpy",  "outcome": "COERCED_CONFESSION" }
  ],
  "consumed_by": [
    { "encounter": "enc_tutorial_minotaur", "apply": { "type": "MODIFY_SHIELDS", "delta": 1 } }
  ]
}
```

정확한 필드는 `src/engine/domain/schemas/flags.ts`와 `content/common/flags.json`의 실제 정의를 읽고 맞출 것. `applyFlagSetHooks`·`resolveFlagEffects`(`src/engine/run/FlagStore.ts`)가 이미 구현돼 있으므로 **데이터만** 채운다.

**최소 요구** — 사건당 `flag_hooks` ≥ 2, 전체에서 **서로 다른 flag_id ≥ 6개**가 set과 consume을 모두 가질 것. 최소 1개는 사건 경계를 넘는 연계(튜토리얼에서 set → ep001에서 consume).

**완료 조건**

```bash
node -e "const fs=require('fs');let h=0,ids=new Set();for(const c of fs.readdirSync('content/cases')){const p='content/cases/'+c+'/case.json';if(!fs.existsSync(p))continue;for(const f of JSON.parse(fs.readFileSync(p,'utf8')).flag_hooks){h++;ids.add(f.flag_id)}}console.log('hooks:',h,'unique flags:',ids.size)"
# 기대: hooks 6 이상, unique flags 6 이상

corepack pnpm content:validate
corepack pnpm simulate:full      # 플래그 on/off 시나리오가 실데이터로 통과
```

**추가할 테스트** — `tests/flags/real-content-flags.test.ts`
- 모든 `set_by[].encounter`가 실제 encounter_id로 해석됨
- 모든 `consumed_by[].encounter`도 동일
- set만 있고 consume이 없는 flag_id가 없을 것 (죽은 플래그 금지)

---

### T3. 보스 3전투 페이즈 구성

**목표** — 현재 전 전투가 `rounds: 1` / `flow_nodes: 1`이라 페이즈 전이가 성립하지 않는다. 보스 3전투에 다라운드·다노드를 부여한다.

**대상** — `enc_tutorial_minotaur` · `enc_ep001_succubus` · `enc_ep004_fallen_hero`

**요구**
- `rounds`: 2~3개. 각 `round_id` 고유, `statement_claims` ≥ 1, `shields[]`에 내구 지정.
- `flow_nodes`: 2~3개. `enter_conditions`는 **Claim 상태 기반**으로 작성한다.
  ```jsonc
  { "type": "CLAIM_EPISTEMIC", "claim_id": "clm_xxx", "state": "REFUTED" }
  ```
  **평정심 %를 `enter_conditions`에 쓰지 말 것** — 평정심은 기믹 트리거(`ON_COMPOSURE_THRESHOLD`)로만 사용한다 (D-7).
- 최소 1개 보스는 `revise_claim_ids`를 가진 FlowNode를 둘 것. COMMITTED 상태 Claim을 수정하면 자동으로 CONTRADICTED가 성립하는 T-6 전이가 데이터만으로 재현되어야 한다.
- 마지막 노드는 `is_terminal: true`.

`FLOW_ENTER_CONDITION_TYPES`(`src/engine/encounter/FlowRunner.ts:12`)에 정의된 타입만 사용할 것.

**완료 조건**

```bash
node -e "const fs=require('fs');for(const c of fs.readdirSync('content/cases')){const p='content/cases/'+c+'/case.json';if(!fs.existsSync(p))continue;for(const e of JSON.parse(fs.readFileSync(p,'utf8')).encounters)console.log(e.encounter_id,'rounds',e.rounds.length,'flow',e.flow_nodes.length)}"
# 기대: 보스 3전투가 rounds>=2, flow>=2

corepack pnpm content:validate   # P-6 무순환 검사 포함
corepack pnpm simulate:full      # 27셀 전 경로 도달
```

---

### T4. 필수 목표 확장

**목표** — 전 전투가 `objectives.required: 1`이라 "필수 주장 해결률"이 0% 아니면 100%로만 나온다. 등급 산출(S~F)이 의미를 갖지 못한다.

**요구** — 전 전투 `objectives.required`를 **2~3개**로. 보스는 3개. `ObjectiveTypeSchema` 12종 중에서 선택하고, `RESOLVE_CLAIM`/`REFUTE_CLAIM` 일변도를 피해 `CONFIRM_CLAIM`·`PRESERVE_EVIDENCE`·`KEEP_COERCION_BELOW`를 섞을 것.

**완료 조건**

```bash
node -e "const fs=require('fs');for(const c of fs.readdirSync('content/cases')){const p='content/cases/'+c+'/case.json';if(!fs.existsSync(p))continue;for(const e of JSON.parse(fs.readFileSync(p,'utf8')).encounters)console.log(e.encounter_id,'required',e.objectives.required.length)}"
# 기대: 전 전투 >=2, 보스 3

corepack pnpm test
```

`hasSolvableRequiredObjectivePath`가 모든 필수 목표에 대해 해결 경로를 요구하므로, 목표를 늘리면 대응 ProofRule·증거도 함께 늘려야 한다. T5와 함께 진행할 것.

---

### T5. 증거 확충

**목표** — 현재 3사건 합계 18개. T4로 필수 목표가 늘면 보장 조합이 부족해진다.

**주의 — "37개"라는 숫자를 근거 없이 따르지 말 것.** 두 갭 문서가 인용한 37은 개발 정본의 **미해결 이슈 DEV-O-4**(증거 카드형 ~20 + 조서 목록형 ~17)에서 온 것으로, 확정 요구사항이 아니다. 또한 기획 정본 §8.5는 **증거 아이콘을 공용 6 + 개별 4 = 10종으로 제한하고 "35항목 개별 제작 금지"**를 명시한다. 아이콘 수와 증거 항목 수는 별개다.

**요구** — 각 사건 **증거 8~10개**(합계 24~30). 각 증거는 다음을 반드시 갖는다.
- `observations[].scopes` — 11종 `ProofScope` 어휘에서 선택
- `independence` — `source_id` / `group` / `derived_from` 3필드
- `not_proven_keys` — "입증하지 못하는 것" 최소 1문장
- `grade.initial` — A/B/C. **B등급 증거를 사건마다 최소 1개** 둘 것(독립성 하한 규칙이 실콘텐츠에서 발동해야 함)

**완료 조건**

```bash
corepack pnpm content:validate   # L-2 증거 획득 경로, L-4 보장 조합 scope 충족
corepack pnpm test
```

---

### T6. 오디오 배선

**목표** — `src/audio/AudioPlayer.ts`(29줄)가 어디서도 호출되지 않는다. SFX 12·BGM 4+2를 연결한다.

**대상 파일**
- `src/audio/AudioPlayer.ts` — 필요 시 확장
- `src/audio/soundRegistry.ts` — **신규**. 키 → 파일 경로 매핑
- `src/app/bootstrap.ts` — 씬 전환·판정 결과에 재생 연결

**요구**

1. **SFX 12키 등록** — `typewriter` · `typewriter_return` · `stamp` · `card_snap` · `paper_flip` · `shield_break` · `door_knock` · `knock_triple` · `qte_success` · `qte_fail` · `shuffle_bubble` · `shredder` · `crt_switch`
2. **BGM 4 + 스팅어 2** — `bgm_interrogation` · `bgm_boss` · `bgm_ambient` · `bgm_ending` · `sting_confession` · `sting_arrest`
3. **파일 부재 시 무음 폴백** — `assets/sfx/`·`assets/bgm/`은 현재 `.gitkeep`뿐이다. **파일이 없어도 예외를 던지지 말고 조용히 no-op** 해야 한다. 애셋 미완이 빌드를 막지 않는 것이 정본 원칙이다.
4. **`ENDING_BGM_MUTE` 연출 실행** — `OUTCOME_DIRECTION_TABLE`이 `O_COERCED_CONFESSION → ENDING_BGM_MUTE`를 이미 반환한다. 이 키를 받으면 BGM을 뮤트한다. **"침묵이 페널티"이므로 새 사운드를 재생하지 않는다.**

**금지** — `src/engine/**`에서 `howler`나 오디오 모듈을 import하지 말 것. 오디오는 `ui`/`app` 계층 전용.

**완료 조건**

```bash
corepack pnpm arch      # engine이 howler를 참조하지 않음
corepack pnpm test
```

**추가할 테스트** — `tests/audio/sound-registry.test.ts`
- SFX 12키 + BGM 6키가 전부 등록됨
- 등록되지 않은 파일 경로로 재생 요청 시 예외 없이 no-op
- `ENDING_BGM_MUTE` 처리가 재생이 아니라 뮤트임

---

### T7. 판정·결말 연출 5종 렌더러

**목표** — `directionTable.ts`가 연출 키를 반환하지만, 그 키를 받아 실제로 그리는 렌더러가 없다.

**대상 파일** — `src/ui/screens/interrogation/directions.ts` (신규)

**요구** — `EndingDirectionKey` 5종에 대응하는 렌더러를 구현한다.

| 키 | 연출 |
|---|---|
| `ENDING_POLAROID` | 용의자 퇴장 + 폴라로이드 진술 획득 프레임 |
| `ENDING_TRANSFER_STAMP` | "송치" 도장 내려찍힘 + 화면 진동 1프레임 |
| `ENDING_BGM_MUTE` | BGM 뮤트(T6 연동). 시각 연출은 승리 포맷 재사용 |
| `ENDING_CARD_AND_KNOCK` | 화면을 덮는 명함 + 노크 3연타 SFX |
| `ENDING_OVERWORK` | 의무실 천장 샷 + 시스템 메시지 |

`JudgmentDirectionKey` 5종도 최소 구현(방어막 균열 + 1프레임 화이트 플래시 수준)을 둔다.

**설계 제약** — 렌더러는 `ResolutionCode`나 `OutcomeCode`로 **분기하지 않는다.** 반드시 `directionForResolution()` / `directionForOutcome()`이 반환한 키로만 조회한다. 코드 분기를 추가하면 데이터 주도 원칙이 깨진다.

애셋(컷 이미지)이 없으므로 `resolveAsset` 폴백 플레이스홀더 위에서 동작해야 한다.

**완료 조건**

```bash
corepack pnpm test
```

**추가할 테스트** — `tests/ui/direction-renderers.test.ts`
- 5개 `EndingDirectionKey` 각각에 렌더러가 존재 (누락 시 실패)
- 5개 `JudgmentDirectionKey`도 동일
- 애셋 미등록 상태에서 렌더러 호출이 예외를 던지지 않음

---

### T8. 포트레이트 플레이스홀더 확충

**목표** — 캐스트 12종 중 `assets/portraits/`에 3종(물컹이·미노타우로스·하피)만 있다. 나머지 9종과 표정 파츠가 없다.

**요구**
1. `tools/placeholder/placeholders.json`에 누락 9종 추가 — 고블린 · 오크 · 드워프 · 사이클롭스 · 서큐버스 · 타락한 용사 · 김태훈 · 김 인턴 · 켄타우로스
2. `corepack pnpm placeholder:generate`로 실루엣+명패 PNG 생성 (**최종 아트가 아니라 플레이스홀더**)
3. 표정 파츠 슬롯: `portrait_<이름>_parts.png` 96×40 + `portrait_<이름>.parts.json` 좌표
4. `runtimeAssetRegistry`가 12종 base를 전부 해결하는지 확인

**주의** — 실제 도트 아트 제작은 이 태스크의 범위가 아니다. **빌드와 플레이가 애셋 미완에 막히지 않는 상태를 만드는 것**이 목표다.

**완료 조건**

```bash
corepack pnpm placeholder:generate
ls assets/portraits/          # base 12종
corepack pnpm test
```

---

## 4. 실행 순서

```
T1 (기믹) → T2 (플래그) → T3 (보스 페이즈)      ← 순차. 콘텐츠 의존성 있음
                ↓
T4 (목표) ↔ T5 (증거)                            ← 짝으로 진행 (해결 경로 검사 때문)
                ↓
T6 (오디오) ‖ T7 (연출) ‖ T8 (플레이스홀더)      ← 병렬 가능. 서로 독립
```

각 태스크 종료 시 반드시:

```bash
corepack pnpm check
```

---

## 5. 최종 완료 판정

아래를 **전부** 만족해야 완료다. 하나라도 미달이면 완료를 선언하지 말 것.

```bash
corepack pnpm check              # lint + arch + typecheck + test + validate + palette + simulate + build
corepack pnpm simulate:full      # 27셀 + 플래그 26 시나리오 + 결정론 리플레이
```

| 판정 항목 | 기준 |
|---|---|
| 테스트 | 388개 유지 + 신규 테스트 전부 green. **기존 테스트 수정 0건** |
| 기믹 | 9전투 전부 `modifiers.length >= 1` |
| 플래그 | `flag_hooks` ≥ 6, 고아 플래그 0 |
| 보스 | 3전투가 `rounds >= 2` 및 `flow_nodes >= 2` |
| 목표 | 전 전투 `objectives.required >= 2` |
| 증거 | 사건당 8~10개, 각 사건에 B등급 ≥ 1 |
| 아키텍처 | `pnpm arch` green, 리터럴 탐지 green |
| 엔진 diff | **`src/engine/**` 변경 0줄** (T1~T5는 순수 데이터 작업) |

마지막 항목이 가장 중요하다. T1~T5를 하면서 엔진을 고쳐야 했다면, 그것은 콘텐츠 문제가 아니라 스키마 설계 결함이므로 **임의로 엔진을 수정하지 말고 보고할 것.**

---

## 6. 이 문서가 다루지 않는 것

- **실제 도트 아트·사운드 제작** — 애셋 제작은 개발 태스크가 아니다. T6·T8은 "애셋이 도착하면 즉시 작동하는 배선"까지만 만든다.
- **AI 라이브 연동** — Provider 체인·검증 7단계·캐시는 이미 구현돼 있다. 출하 빌드는 P0(폴백 완주)이며 AI는 개발 콘솔에서만 켠다.
- **밸런스 수치 튜닝** — `balance.json`의 TBD 값 확정은 M5 작업이며 코드 변경이 아니다.
