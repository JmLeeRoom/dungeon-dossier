# 에피소드 진행 방식 & 노드 노출 구조 비교 분석

> **문서 상태**: Structural Gap Analysis / 구현 전 설계 감사
>
> **감사 기준일**: 2026-08-08
>
> **대상 저장소**: `dungeon-dossier/`
>
> **비교 기준**: 기획자 발화 명세 — 튜토리얼 강제 진입, 에피소드별 `Combat → Event → Boss` 3단계, `tutorial → ep001 → ep004` 순차 진행, 현재 에피소드의 3노드만 국소 공개, Fog-of-War 및 런별 발견감
>
> **범위**: 콘텐츠 스키마, 런 진행 상태, 노드 경계 저장/복원, 수사 보드 프레젠테이션, 자동화 테스트

---

## 1. Executive Summary

### 1.1 핵심 판정

| ID | 기획 요구 | 현재 구현 | 판정 | 중요도 |
|---|---|---|---|---|
| GAP-01 | 에피소드마다 `Combat → Event → Boss` 3노드 | 3개 에피소드가 각각 `Encounter → Event → Encounter → Event → Boss` 5노드 | **불일치** | Blocker |
| GAP-02 | 튜토리얼 완료 후 ep001, 그다음 ep004를 명시적으로 해금 | 현재 배열 순서와 `nodeIndex + 1` 때문에 같은 순서로 이동하지만 에피소드 상태·경계·해금 규칙은 없음 | **부분 일치** | High |
| GAP-03 | 활성 에피소드의 3노드만 공개하고 미래 콘텐츠는 안개 처리 | 전체 15노드의 번호·이름·종류·보스 실루엣을 5열×3행으로 항상 렌더링 | **불일치** | Blocker |

현재 구현은 “에피소드 진행 시스템”이라기보다 **15개 노드로 이루어진 하나의 선형 배열**이다. 플레이 결과가 우연히 `tutorial → ep001 → ep004` 순서를 따르기는 하지만, 이는 도메인 규칙이 아니라 `run-strip.json`의 배열 배치에 의존한다.

```text
현재
nodeIndex 0..4              5..9                 10..14
[tutorial 5노드]  ──────▶  [ep001 5노드]  ───▶  [ep004 5노드]  ───▶ 종료
       배열 index + 1             배열 index + 1

기획 발화
[tutorial: C-E-B] ───────▶ [ep001: C-E-B] ───▶ [ep004: C-E-B] ───▶ 종료
          보스 클리어/해금 이벤트       보스 클리어/해금 이벤트
```

또한 현재의 `LOCKED`는 Fog-of-War가 아니다. 잠긴 노드도 라벨과 종류가 모두 UI 모델과 Pixi 렌더러에 전달되며, 회색으로만 표시된다. 새 런의 기본 시드도 고정값이므로 노드 구성과 공개 순서는 런마다 동일하다. 따라서 현재 상태에는 **시각적 발견감도, 경로 선택도, 구조적 리플레이성도 없다**.

### 1.2 구현 전에 반드시 확정할 사양 충돌

발화에는 다음 두 조건이 동시에 등장한다.

1. 현재 15개 노드 대신 3노드 단위로 공개한다.
2. 현재 확인되는 에피소드는 `tutorial`, `ep001`, `ep004`이며 각 에피소드는 3단계다.

세 에피소드가 각각 3노드라면 한 런은 **9노드**다. 한 런을 15노드로 유지하면서 에피소드당 3노드로 만들려면 **5개 에피소드**가 필요하다. 따라서 아래 선택은 데이터 변경 전에 ADR로 확정해야 한다.

| 선택지 | 한 런의 구조 | 장점 | 비용/한계 | 명세 적합성 |
|---|---|---|---|---|
| A. 9노드 고정 런 | 3에피소드 × 3노드 | 발화 그대로 구현, 가장 단순한 진행 규칙 | 기존 6개 노드를 런에서 제외하거나 재배치 | 높음 |
| B. 15노드 고정 런 | 5에피소드 × 3노드 | 15노드 계약 유지 | 미작성 에피소드 2개의 콘텐츠 필요 | 조건부 |
| C. 기존 15노드 + 3노드 표시 창 | 3에피소드 × 5노드, UI만 3개 | 엔진·세이브 변경 최소 | 에피소드 3단계 명세를 충족하지 못하고 안개가 장식에 머묾 | 낮음 |
| D. 15개 저작 후보에서 9개를 런별 확정 | 3에피소드 × `Combat/Event/Boss`, 각 슬롯 후보 풀 | 기존 콘텐츠를 후보로 보존하면서 실제 리플레이성 제공 | 경로 생성·검증·세이브 마이그레이션 필요 | **권장 장기안** |

**권고**: 발화가 최종 기획 기준이라면 `Combat/Event/Boss`를 절대 불변식으로 삼고, **D안**을 목표 구조로 채택하는 것이 가장 일관된다. 각 런은 9개 노드만 진행하되 현재의 일반 전투 2개와 이벤트 2개를 슬롯 후보로 활용할 수 있다. 단, 튜토리얼은 `slime → tutorial event → minotaur`를 고정하고 남는 `harpy` 및 `placement`의 재배치 여부를 별도로 승인받아야 한다. 출시 일정상 엔진 변경을 최소화해야 한다면 C안을 임시 단계로 사용할 수 있으나, 이를 최종 명세 충족으로 판정해서는 안 된다.

---

## 2. Current Architecture Audit

### 2.1 경로 및 책임 소재 정정

마스터 프롬프트에 적힌 일부 경로는 현재 저장소와 다르다.

| 프롬프트 표기 | 실제 구현 | 역할 |
|---|---|---|
| `src/engine/run/RunCatalogRepository.ts` | **존재하지 않음** | — |
| `src/content-io/RunCatalogRepository.ts` | 존재 | flags, grades, rewards, relics, enhancements 로드 |
| `src/content-io/RunStripRepository.ts` | 존재 | `/content/common/run-strip.json` 로드 |
| `src/ui/screens/nodeMap.ts` | **존재하지 않음** | — |
| `src/ui/screens/strip/model.ts` | 존재 | 15노드 화면 모델 및 상태 계산 |
| `src/ui/screens/strip/createRunStripScreen.ts` | 존재 | PixiJS 노드 보드 렌더링 |
| `src/app/gameFlowPresentation.ts` | 존재 | 전체 run strip을 UI 모델로 변환 |
| `src/app/bootstrap.ts` | 존재 | strip 화면 마운트 및 현재 노드 진입 |

`RunCatalogRepository`는 노드 시퀀스를 읽지 않는다(`src/content-io/RunCatalogRepository.ts:18-24,42-59`). 노드 시퀀스의 실제 진입점은 `RunStripRepository`(`src/content-io/RunStripRepository.ts:7-17`)다. 이후 부트스트랩이 두 저장소와 모든 case 콘텐츠를 한 번에 로드한다(`src/app/bootstrap.ts:180-223`).

### 2.2 에피소드 노드 시퀀스 감사

#### 실제 15노드 구성

| 에피소드 / 전역 index | 실제 노드 시퀀스 | 목표 `C → E → B` | 판정 |
|---|---|---|---|
| tutorial / 0–4 | `enc_tutorial_slime` → `event_tutorial_choice` → `enc_tutorial_harpy` → `event_tutorial_placement` → `enc_tutorial_minotaur` | slime → tutorial event → minotaur | **Fail** |
| ep001 / 5–9 | `enc_ep001_goblin` → `event_ep001_forensic_sweep` → `enc_ep001_orc` → `event_ep001_warehouse` → `enc_ep001_succubus` | 일반 전투 → 이벤트 → 보스 | **Fail** |
| ep004 / 10–14 | `enc_ep004_dwarf` → `event_ep004_machine_room` → `enc_ep004_cyclops` → `event_ep004_broker_canvass` → `enc_ep004_fallen_hero` | 일반 전투 → 이벤트 → 보스 | **Fail** |

근거:

- tutorial: `content/common/run-strip.json:5-34`
- ep001: `content/common/run-strip.json:35-64`
- ep004: `content/common/run-strip.json:65-94`

세 묶음 모두 정확히 `ENCOUNTER → EVENT → ENCOUNTER → EVENT → BOSS`다. 15개를 에피소드 경계와 무관하게 단순히 3개씩 자르더라도 종류 조합은 다음과 같다.

```text
[ENCOUNTER, EVENT, ENCOUNTER]
[EVENT, BOSS, ENCOUNTER]
[EVENT, ENCOUNTER, EVENT]
[BOSS, ENCOUNTER, EVENT]
[ENCOUNTER, EVENT, BOSS]
```

마지막 묶음만 목표 패턴과 일치하며, 실제 case 경계 기준으로는 **0/3 에피소드**가 3단계 패턴을 충족한다.

#### 스키마가 보장하는 것과 보장하지 않는 것

`RunStripSchema`는 현재 다음만 보장한다.

- 노드 종류가 `ENCOUNTER | EVENT | BOSS` 중 하나임
- 노드 배열이 정확히 15개임
- `node_id`가 중복되지 않음

근거는 `src/engine/domain/schemas/runStrip.ts:10-39` 및 `schemas/run-strip.schema.json:33-39`다. 다음 항목은 검증하지 않는다.

- 첫 에피소드가 tutorial인지
- 에피소드 순서가 `tutorial → ep001 → ep004`인지
- case별 노드 수가 3개인지
- 단계 순서가 `Combat → Event → Boss`인지
- `BOSS`가 각 에피소드의 마지막인지
- `case_directory`가 바뀌는 지점이 합법적인 에피소드 경계인지
- `ep004`가 표시상 두 번째 본편 에피소드인지

콘텐츠 도구 검증기 역시 참조 존재 여부와 소유 directory를 확인하지만 단계 패턴은 검사하지 않는다(`src/content-io/ToolContentValidator.ts:413-438`).

case 메타데이터의 `act`는 tutorial=0, ep001=1, ep004=4다(각 `content/cases/*/case.json:4-10`). 따라서 “ep004가 실질적 두 번째 본편 에피소드”라는 의미는 act에도 표현되지 않는다. 현재 그 의미는 오직 run-strip 배열 위치로만 드러난다.

### 2.3 런 진행 및 에피소드 순차 해금 감사

#### 현재 상태 모델

`RunState`는 `nodeIndex`, `completedNodeIds`, 자원, 보상/결과 이력과 `terminal`을 가진다(`src/engine/run/RunState.ts:102-133`). 다음 필드는 없다.

- `currentEpisodeId` 또는 `episodeIndex`
- 에피소드 내부 `stageIndex`
- `unlockedEpisodeIds` / `completedEpisodeIds`
- `availableNodeIds` / `revealedNodeIds`
- 현재 런에서 확정된 경로 topology

새 상태는 항상 `nodeIndex: 0`에서 시작한다(`src/engine/run/RunState.ts:302-334`). 현재 데이터의 0번 노드가 tutorial slime이므로 실제 플레이는 튜토리얼부터 시작하지만, 엔진이나 스키마가 “튜토리얼 강제 진입”을 불변식으로 검증하지는 않는다.

`NodeStrip`은 배열 순서를 그대로 보존하고 유일한 전이를 `nodeIndex + 1`로 정의한다(`src/engine/run/NodeStrip.ts:15-25,42-49`). 성공한 전투는 `src/engine/run/RunState.ts:409-443`, 이벤트는 `src/engine/run/RunState.ts:856-885`에서 같은 방식으로 한 칸 전진한다.

따라서 현재의 경계 이동은 다음과 같이 동작한다.

| 완료 노드 | index 변화 | 결과 |
|---|---:|---|
| tutorial boss `run_tutorial_05` | 4 → 5 | ep001 첫 노드로 이동 |
| ep001 boss `run_ep001_05` | 9 → 10 | ep004 첫 노드로 이동 |
| ep004 boss `run_ep004_05` | 14 → 15 | 런 종료 |

이는 **행동 결과로는 기획 순서와 일치**하지만, `EPISODE_CLEARED` 또는 `EPISODE_UNLOCKED` 같은 도메인 전이는 발생하지 않는다. 배열 순서를 잘못 편집해도 스키마가 이를 막지 못한다.

전투 완료 입력의 `episodeId`(`src/engine/run/RunState.ts:166-184`)는 진행 상태가 아니다. 보상 후보를 필터링할 때만 사용되며(`src/engine/run/RunState.ts:390-406`), 부트스트랩이 현재 case ID를 전달한다(`src/app/bootstrap.ts:1022-1045`).

#### 저장 및 재개

`RunSession`은 전투, 이벤트, 보상 선택 경계마다 저장한다(`src/app/createRunSession.ts:48-104`). 저장 메타데이터는 완료 후의 `nodeIndex`에 해당하는 다음 노드의 `caseDirectory`에서 선택한다(`src/app/createRunSession.ts:107-129`). 이 때문에:

- tutorial boss 완료 직후 save의 `case_id`는 ep001
- ep001 boss 완료 직후 save의 `case_id`는 ep004
- 최종 완료 save는 마지막 index로 clamp되어 ep004

이 동작은 현 배열에서는 올바르다. 다만 “다음 에피소드 해금”을 저장하는 것이 아니라, 다음 전역 index를 저장할 뿐이다.

`toRunSaveData`는 `node_index`와 `completed_node_ids`를 저장하지만 에피소드/노출/해금 상태는 저장하지 않는다(`src/app/save/runSave.ts:207-272`). 복원 검증은 완료 ID가 현재 strip의 정확한 prefix인지 요구한다(`src/app/save/runSave.ts:56-118`). 이 규칙은 현재 선형 진행을 강하게 보호하지만, 향후 분기 노드나 복수 선택 노드가 생기면 그대로 사용할 수 없다.

엔딩에서 다시 시작하면 save를 지우고 새 `RunState`를 만들어 index 0으로 돌아간다(`src/app/bootstrap.ts:550-575`). 런 간에 유지되는 캠페인 에피소드 해금 저장소는 없다.

#### 부수적으로 발견된 저장 복원 결함

에피소드 리팩터링 전에 별도 수정해야 할 높은 위험의 모순이 있다.

- 앱은 패배에 `RETRY` 정책을 전달한다(`src/app/bootstrap.ts:1043-1046`).
- 재시도 가능한 패배는 같은 nodeIndex, `terminal: false`, 이력의 마지막 `FAILED`로 저장된다(`src/engine/run/RunState.ts:409-443`).
- 그러나 복원 검증기는 마지막 결과가 `FAILED`이면 이를 terminal 패배로 간주하고 `terminal: true`를 요구한다(`src/app/save/runSave.ts:76-95`).
- 재시도 후 성공하더라도 앞선 `FAILED`가 이력에 남는데, 검증기는 마지막 항목 이전의 `FAILED`를 모두 거부한다(`src/app/save/runSave.ts:90-109`).

따라서 retry 경계 또는 retry 성공 뒤의 save가 부트스트랩 복원 경로에서 거부되어 새 런으로 초기화될 수 있다. 에피소드 save 버전 변경과 이 결함을 한 번에 섞지 말고, 먼저 현재 계약을 테스트로 재현한 뒤 수정해야 한다.

### 2.4 수사 보드 노드 표시 감사

`toRunStripScreenModel`은 전체 strip을 `nodeId`, `kind`, 현지화된 `label`로 변환하여 UI에 넘긴다(`src/app/gameFlowPresentation.ts:66-81`). UI 모델은 정확히 15개를 강제하고, 전역 `currentIndex` 하나로 모든 노드 상태를 `CLEARED | CURRENT | LOCKED`로 나눈다(`src/ui/screens/strip/model.ts:1-32`).

렌더러는 전체 모델을 순회하며 다음 좌표를 사용한다(`src/ui/screens/strip/createRunStripScreen.ts:27-31`).

```ts
row = Math.floor(index / 5);
column = index % 5;
```

따라서 실제 배치는 **5열 × 3행**이다. “3×5 그리드”라는 표현을 행×열로 해석하면 방향은 반대지만, 핵심적으로 15개가 모두 노출된다는 진단은 맞다.

미래 노드의 현재 노출 정보:

| 정보 | 잠긴 노드에서의 상태 | 근거 |
|---|---|---|
| 위치 및 전체 개수 | 노출 | 전체 `model.nodes` 순회 |
| 순번 | 노출 | `createRunStripScreen.ts:43-48` |
| 현지화된 이름 | muted 색으로 노출 | `:49-58` |
| Encounter/Event/Boss 종류 | 색상·형태로 노출 | `:10-14,38-42` |
| 보스 여부 | 각진 아이콘으로 노출 | `:39-42` |
| 연결 구조 | 행별 선으로 노출 | `:32-37` |

즉 `LOCKED`는 접근 제한을 나타내는 회색 스타일일 뿐, 미래 정보를 가리는 안개가 아니다.

노드 아이콘 자체는 선택할 수 없으며, 유일한 입력은 “다음 기록으로” 버튼이다(`src/ui/screens/strip/createRunStripScreen.ts:67-81`). 부트스트랩도 현재 전역 index의 단일 노드만 연다(`src/app/bootstrap.ts:1555-1610`). 따라서 “현재 선택 가능한 노드 세트”라는 개념과 API는 없다.

또한 현재 strip 화면은 640×400 절대 좌표 기반이며 별도 카메라, viewport, mask, zoom 또는 reveal lifecycle이 없다. 앱 전체의 정수 배율 확대만 적용된다. Fog 전용 에셋도 현재 asset tree에서 확인되지 않았다. MVP 안개는 Pixi `Graphics`와 `?` 텍스트로 구현할 수 있고, 텍스처 기반 안개를 사용할 때만 신규 에셋 등록이 필요하다.

### 2.5 로그라이트 안개와 리플레이성 감사

“안개”는 두 수준으로 구분해야 한다.

| 수준 | 의미 | 현재 엔진 변경 | 저장 변경 | 실제 리플레이성 |
|---|---|---:|---:|---:|
| A. 프레젠테이션 안개 | 고정 경로에서 아직 공개하지 않은 정보를 숨김 | 선택 사항 | 불필요 | 없음 |
| B. 시스템 안개 | 런별 후보/경로를 생성하고 발견·선택 결과가 진행에 영향 | 필수 | 필수 | 있음 |

선형 3단계 경로만 필요하다면 공개 상태는 현재 cursor와 콘텐츠 경계에서 순수하게 파생할 수 있다. 이 경우 `revealedNodeIds`를 중복 저장할 이유가 없다.

반대로 다음 중 하나라도 요구되면 엔진 기능이다.

- 여러 `AVAILABLE` 노드 중 하나를 선택
- 선택하지 않은 경로를 폐쇄
- run seed에 따라 등장 노드가 달라짐
- 방문한 노드 또는 발견 상태가 저장/복원됨
- 후보 풀이 런마다 다른 3단계 경로로 확정됨

현재 `DEFAULT_RUN_SEED`는 `20_260_803` 고정값이다(`src/app/gameRunState.ts:21,40-62`). run-strip 자체도 고정 배열이므로 새 런을 시작해도 topology가 달라지지 않는다. 회색 노드를 `?`로 바꾸는 것만으로는 로그라이트 리플레이성이 생기지 않는다.

---

## 3. Proposed UI/Engine Modifications

### 3.1 목표 도메인 계약

최종 구조는 “렌더링을 위해 3개를 자르는 방식”이 아니라 **에피소드와 세 단계를 콘텐츠 도메인에 명시**해야 한다.

권장 개념 스키마:

```json
{
  "schema_version": "2.0",
  "episodes": [
    {
      "episode_id": "tutorial",
      "sequence_index": 0,
      "case_directory": "tutorial",
      "slots": [
        {
          "role": "COMBAT",
          "selection": "FIXED",
          "candidates": [
            {
              "node_id": "run_tutorial_01",
              "kind": "ENCOUNTER",
              "ref": "enc_tutorial_slime"
            }
          ]
        },
        {
          "role": "EVENT",
          "selection": "FIXED",
          "candidates": [
            {
              "node_id": "run_tutorial_02",
              "kind": "EVENT",
              "ref": "event_tutorial_choice"
            }
          ]
        },
        {
          "role": "BOSS",
          "selection": "FIXED",
          "candidates": [
            {
              "node_id": "run_tutorial_05",
              "kind": "BOSS",
              "ref": "enc_tutorial_minotaur"
            }
          ]
        }
      ]
    }
  ]
}
```

일반 에피소드에서는 `selection: SEEDED_ONE`과 복수 후보를 허용할 수 있다. 콘텐츠 로드 시 이 정의를 검증하고, 새 런 생성 시 후보를 확정하여 엔진이 사용하는 평면 `ResolvedRunRoute`로 변환한다.

필수 불변식:

1. 첫 에피소드는 `tutorial`이다.
2. `sequence_index`는 중복 없이 연속이며 현재 승인 순서는 `tutorial → ep001 → ep004`다.
3. 각 에피소드는 정확히 세 슬롯 `COMBAT → EVENT → BOSS`를 가진다.
4. `COMBAT` 후보는 `ENCOUNTER`, `EVENT` 후보는 `EVENT`, `BOSS` 후보는 `BOSS`여야 한다.
5. 모든 후보 ref는 해당 `case_directory`에 존재해야 한다.
6. 확정된 런 경로는 에피소드당 정확히 한 후보씩, 총 3노드를 가진다.
7. 같은 seed와 topology version은 같은 경로를 만든다.
8. 튜토리얼 고정 노드는 seed에 의해 바뀌지 않는다.

최소 고정 경로만 필요하다면 각 슬롯의 후보를 하나로 두면 된다. 이 구조는 이후 후보 풀을 추가해도 스키마를 다시 뒤집지 않는다.

### 3.2 진행 상태 및 전이

중복 상태를 많이 저장하기보다, 런 생성 시 확정된 route와 하나의 cursor를 진실의 원천으로 두는 편이 안전하다.

```ts
interface ResolvedRunRoute {
  readonly topologyVersion: string;
  readonly episodeIds: readonly string[];
  readonly nodes: readonly ResolvedRunNode[];
}

interface RunProgress {
  readonly currentNodeIndex: number;
  readonly completedNodeIds: readonly string[];
}

type ProgressionEvent =
  | { type: 'NODE_CLEARED'; nodeId: string }
  | { type: 'EPISODE_CLEARED'; episodeId: string }
  | { type: 'EPISODE_UNLOCKED'; episodeId: string }
  | { type: 'RUN_CLEARED' };
```

`currentEpisodeId`, `stageIndex`, 완료 에피소드 목록은 route와 cursor에서 파생할 수 있다. UI 해금 애니메이션에는 상태 필드를 억지로 추가하지 말고, 전이 함수가 반환하는 `ProgressionEvent`를 사용한다.

분기 선택까지 포함하면 다음 필드와 API가 추가로 필요하다.

- `availableNodeIds`
- `revealedNodeIds`
- `selectedNodeId` 또는 `currentNodeId`
- `RunSession.selectNode(nodeId)`
- 후보 간 edge/reveal 조건

이 경우 `completedNodeIds === strip.slice(0, nodeIndex)`라는 현재 저장 불변식은 경로 기반 검증으로 교체해야 한다.

#### 캠페인 해금과 런 내 공개의 분리

발화의 “다음 에피소드 해금”이 한 런 안에서만 유지되는지, 다음 런에도 남는 캠페인 진행인지 확정해야 한다.

- **런 내 순차 공개**: route/cursor에서 파생하며 별도 저장 불필요
- **런 간 영구 해금**: `RunSave`와 분리된 `CampaignProgress`에 `completedEpisodeIds`와 `unlockedEpisodeIds`를 저장

엔딩의 “새 런”이 fog를 초기화하면서 캠페인 해금은 유지해야 한다면 두 저장 수명은 반드시 분리해야 한다.

### 3.3 세이브 호환성

변경 범위에 따른 저장 전략:

| 변경 | save schema 변경 | 권장 처리 |
|---|---:|---|
| 기존 선형 15노드 유지, UI만 국소 공개 | 불필요 | `nodeIndex`로 공개 상태 파생 |
| 9노드 또는 5×3 구조로 콘텐츠 순서 변경 | 필요 가능성 높음 | save version 상승, stable node ID 기반 경계 매핑 |
| seed로 9노드 경로 확정 | 필수 | 확정된 node ID 목록과 `topologyVersion` 저장 |
| 플레이어가 분기 선택 | 필수 | 선택/공개/폐쇄된 노드와 edge 검증 정보 저장 |

seed만 저장하고 매번 경로를 다시 생성하면 생성 알고리즘이나 후보 풀이 변경된 뒤 기존 save의 경로가 바뀔 수 있다. 따라서 **확정된 route의 node ID 목록을 save에 저장**하고 seed는 재현·진단용으로 유지해야 한다.

기존 15노드 save의 마이그레이션은 단순 index 치환이 아니라 완료된 stable node ID를 기준으로 해야 한다. 제거 또는 후보화된 노드에서 저장된 사용자는 다음 유효 슬롯으로 이동할지, 해당 에피소드를 완료 처리할지, 명시적으로 런을 재시작할지 제품 정책이 필요하다.

### 3.4 3노드 클러스터 포커스 UI

#### 정보 모델

미래 정보를 렌더러에서 덮는 방식은 누출 위험이 있다. UI 모델 단계에서 미래 노드의 라벨과 종류를 제거하는 판별 유니온을 권장한다.

```ts
type EpisodeNodeView =
  | {
      visibility: 'KNOWN';
      nodeId: string;
      role: 'COMBAT' | 'EVENT' | 'BOSS';
      label: string;
      status: 'CLEARED' | 'CURRENT' | 'AVAILABLE';
    }
  | {
      visibility: 'VEILED';
      slotId: string;
    };

interface EpisodeBoardModel {
  readonly episodeId: string;
  readonly episodeDisplayIndex: number;
  readonly nodes: readonly [EpisodeNodeView, EpisodeNodeView, EpisodeNodeView];
  readonly previousEpisodeSummaries: readonly EpisodeSummaryView[];
  readonly nextEpisodeMarker?: { readonly visibility: 'VEILED' };
}
```

이 방식은 잠긴 노드에 `label`, `kind`, `ref` 자체가 없으므로 렌더러, 자동 플레이 텔레메트리, 접근성 텍스트에서 미래 정보가 새는 것을 함께 막는다.

#### 공개 규칙

| 진행 시점 | 상세 노출 |
|---|---|
| 에피소드 진입 | 활성 에피소드의 3개 슬롯 프레임만 표시; 현재 Combat만 `KNOWN/CURRENT`, 뒤 슬롯은 `VEILED` |
| Combat 완료 | Combat `CLEARED`, Event `KNOWN/CURRENT`, Boss `VEILED` |
| Event 완료 | Combat/Event `CLEARED`, Boss `KNOWN/CURRENT` |
| Boss 완료 | 짧은 완료 연출 후 다음 에피소드 클러스터로 전환 |
| 미래 에피소드 | 이름·노드 수·종류를 노출하지 않는 단일 안개 마커 또는 완전 비표시 |

기획이 “활성 에피소드의 세 종류를 처음부터 모두 보여준다”는 의미라면 슬롯 세 개를 모두 `KNOWN`으로 두되, 미래 에피소드만 숨기면 된다. 이 항목은 UX 결정으로 분리하고 데이터 구조는 동일하게 유지할 수 있다.

#### Pixi 렌더링

`createRunStripScreen.ts`의 전역 15개 고정 좌표를 다음으로 분리한다.

1. `layoutEpisodeCluster(3 nodes)` — 테스트 가능한 순수 좌표 계산
2. `createRunNodeView` — known/current/cleared/available 표현
3. `createFogOverlay` — 동일 실루엣, `?`, 반투명 베일
4. `createEpisodeTransitionController` — fade/scale/reveal 진행과 정리

활성 3노드는 화면 중앙에 확대 배치한다. 과거 에피소드는 작은 완료 조서 요약으로 축약하고, 미래 에피소드는 상세 슬롯을 만들지 않는다. 현재 `SceneManager`의 enter/exit/destroy lifecycle을 활용하고, 애니메이션이 필요하면 ticker 등록과 해제를 controller가 소유해야 한다.

MVP는 기존 팔레트와 Pixi `Graphics`만으로 구현할 수 있다. 안개 텍스처를 추가할 경우 asset manifest, preload 및 누락 에셋 검증을 함께 갱신한다. 시각 연출은 진행 규칙과 분리하여, 애니메이션을 건너뛰어도 최종 공개 상태가 동일해야 한다.

### 3.5 실제 로그라이트 경로 생성

D안을 채택할 경우:

1. 각 에피소드의 `COMBAT`와 `EVENT` 후보 풀에서 한 개씩 결정론적으로 선택한다.
2. `BOSS`는 기본적으로 고정한다.
3. 보상 RNG와 topology RNG stream을 분리한다.
4. production 새 런은 새로운 uint32 seed를 만들고, dev/autoplay는 명시적 seed override를 사용한다.
5. 확정된 route를 save에 기록한다.
6. 콘텐츠 버전이 바뀌어도 저장된 route의 참조가 유효한지 검증한다.

동일 seed 재현성 외에 모든 후보가 실제로 선택 가능한지, 어떤 seed에서도 `Combat → Event → Boss`와 종결 가능성이 유지되는지 property-style Vitest로 검사해야 한다.

---

## 4. Refactoring Roadmap & Action Items

### 4.1 단계별 로드맵

#### Phase 0 — 기획 결정 및 ADR

- **ADR-001**: 9노드, 5×3, 15노드 표시 창, 후보 풀 방식 중 canonical run 구조 확정
- **ADR-002**: 활성 에피소드 진입 시 세 슬롯을 모두 공개할지 단계별로 공개할지 확정
- **ADR-003**: “해금”이 런 내 상태인지 캠페인 영구 상태인지 확정
- **ADR-004**: 기존 15노드 save의 마이그레이션/초기화 정책 확정
- **ADR-005**: tutorial의 `harpy`와 `placement`를 이동, 후보화 또는 제거할지 확정

Phase 0가 끝나기 전에는 `run-strip.json`의 노드 수를 먼저 변경하지 않는다.

#### Phase 1 — 콘텐츠 계약과 검증

- `content/common/run-strip.json`을 episode/slot 또는 이에 동등한 명시적 구조로 개편
- `src/engine/domain/schemas/runStrip.ts`와 `schemas/run-strip.schema.json`에서 3단계 불변식 검증
- `src/content-io/RunStripRepository.ts`에서 새 schema/version 로드
- `src/content-io/ToolContentValidator.ts`에서 후보 ref, case 소유권, 단계 종류, episode 순서 검증
- loader 결과를 `ResolvedRunRoute`로 변환하는 순수 resolver 추가

#### Phase 2 — 진행 엔진 및 저장

- `src/engine/run/NodeStrip.ts`에 episode 경계/slot 조회와 route 검증 helper 추가
- `src/engine/run/RunState.ts`가 노드 완료 시 progression event를 반환하도록 확장
- `src/app/createRunSession.ts`에서 episode boundary event를 저장·발행
- `src/engine/domain/schemas/save.ts` 및 `src/app/save/runSave.ts`에 route snapshot/topology version 추가
- 분기안이면 `availableNodeIds`, `revealedNodeIds`, `selectNode` 및 복원 의미 검증 추가
- `src/app/gameRunState.ts`에서 production seed 생성과 dev override 정책 분리
- retry 가능한 패배 save 복원 모순을 별도 변경으로 먼저 수정

#### Phase 3 — 수사 보드 UI

- `src/app/gameFlowPresentation.ts`에서 전체 15노드 전달을 중단하고 활성 cluster projection 생성
- `src/ui/screens/strip/model.ts`를 `EpisodeBoardModel`과 redacted `VEILED` 모델로 교체
- `src/ui/screens/strip/createRunStripScreen.ts`를 3노드 포커스 레이아웃으로 변경
- 필요 시 `src/ui/widgets/runNode.ts`, `src/ui/widgets/fogOverlay.ts`, `src/ui/screens/strip/layoutEpisodeCluster.ts` 추가
- `src/app/bootstrap.ts`에서 `EPISODE_UNLOCKED` 전환 연출 및 선택 callback 연결
- 미래 콘텐츠가 화면 모델, 텔레메트리, 접근성 문자열에 포함되지 않도록 확인

#### Phase 4 — 로그라이트 후보 풀

- episode/slot별 후보 풀 저작
- topology RNG stream과 route resolver 도입
- 확정 route 저장 및 콘텐츠 변경 내성 검증
- 새 런 seed 생성, dev/autoplay seed 주입, 재현 보고서 추가
- 모든 후보의 도달 가능성과 콘텐츠 참조 유효성 검증

#### Phase 5 — 회귀 및 시각 검증

- 15노드 고정 가정을 가진 단위/통합/브라우저 테스트 갱신
- episode 경계 save/reload 시나리오 추가
- fog 정보 비노출 테스트 추가
- tutorial boss 직전/직후와 ep001/ep004 진입 시각 회귀 캡처 추가
- Node 22 지원 버전에서 전체 gate 재실행

### 4.2 파일 단위 작업 목록

| 우선순위 | 파일 | 변경 요약 | 완료 조건 |
|---|---|---|---|
| P0 | `content/common/run-strip.json` | episode/slot/후보 관계 명시 | tutorial, ep001, ep004가 검증 가능한 3단계로 표현됨 |
| P0 | `src/engine/domain/schemas/runStrip.ts` | exact 15 제거 또는 candidate-count와 resolved-count 분리 | 잘못된 순서·개수·종류가 parse 단계에서 거부됨 |
| P0 | `schemas/run-strip.schema.json` | TS schema와 동일한 외부 계약 반영 | schema export test 일치 |
| P0 | `src/content-io/ToolContentValidator.ts` | episode 순서와 후보 ref 의미 검증 | 잘못된 case/role 참조가 진단 메시지와 함께 실패 |
| P0 | `src/app/gameFlowPresentation.ts` | 전체 strip 대신 활성 cluster 및 redaction | 미래 label/kind/ref가 모델에 없음 |
| P0 | `src/ui/screens/strip/model.ts` | 15개 고정과 `LOCKED` 모델 제거 | 3개 tuple 및 `KNOWN/VEILED` 불변식 통과 |
| P0 | `src/ui/screens/strip/createRunStripScreen.ts` | 5×3 전체 보드에서 3노드 포커스로 전환 | 화면에 활성 3슬롯 외 상세 노드가 없음 |
| P1 | `src/engine/run/NodeStrip.ts` | episode grouping, resolver, progression helper | 고정 `/3` 또는 `/5` 산술 없이 경계 계산 |
| P1 | `src/engine/run/RunState.ts` | 명시적 episode transition 결과 및 선택 상태 | boss 완료가 정확한 unlock event를 생성 |
| P1 | `src/app/createRunSession.ts` | 경계 이벤트와 route-aware save | tutorial→ep001, ep001→ep004 저장/재개 성공 |
| P1 | `src/engine/domain/schemas/save.ts` | route snapshot/분기 상태 계약 | save tampering 및 오래된 topology 감지 |
| P1 | `src/app/save/runSave.ts` | prefix 검증을 resolved route 검증으로 전환 | 고정·분기 경로 모두 의미 검증 통과 |
| P1 | `src/app/bootstrap.ts` | 활성 cluster 마운트, reveal transition, 선택 callback | 경계마다 다음 cluster만 공개 |
| P1 | `src/app/save/runSave.ts` | retry save 의미 검증 결함 수정 | retry 전/후 새로고침 시 진행 유지 |
| P2 | `src/app/gameRunState.ts` | production seed 생성 정책 | 새 런은 새 seed, 명시 seed는 완전 재현 |
| P2 | `src/dev/autoPlayHarness.ts` 및 `src/dev/autoplay/*` | resolved route 및 cluster checkpoint 보고 | seed·route·episode 경계 아티팩트 기록 |
| P2 | 신규 UI widget/asset 파일 | fog 및 reveal 연출 | 에셋 누락·ticker 누수·비결정 시각 테스트 없음 |

### 4.3 Vitest 검증 계획

#### 콘텐츠/스키마

신규 `tests/content/run-strip-progression.test.ts` 또는 동등 suite:

- tutorial이 첫 episode가 아니면 실패
- episode 순서 중복/누락 시 실패
- 2개 또는 4개 슬롯이면 실패
- `COMBAT → EVENT → BOSS` 순서를 바꾸면 실패
- role과 ref 종류가 다르면 실패
- 다른 case가 소유한 ref를 넣으면 실패
- 동일 seed + 동일 topology version이 동일 route를 생성
- 후보가 있는 모든 slot이 seed 표본 범위에서 도달 가능

#### 엔진/세션

`tests/engine/run-layer.test.ts`와 신규 episode progression suite:

- fresh run의 첫 노드는 tutorial Combat
- Combat 완료 후 같은 episode Event
- Event 완료 후 같은 episode Boss
- tutorial Boss 완료 시 `EPISODE_CLEARED(tutorial)`와 `EPISODE_UNLOCKED(ep001)`
- ep001 Boss 완료 시 ep004 해금
- ep004 Boss 완료 시 `RUN_CLEARED`
- 잘못된 node 선택, 미공개 node 선택, 순서 건너뛰기 거부

`tests/app/run-session.test.ts`:

- tutorial boss 경계 save가 ep001 route/case metadata로 저장됨
- ep001 boss 경계 save가 ep004 metadata로 저장됨
- 두 경계에서 저장 후 새 session으로 복원해 같은 노드에서 계속됨
- 최종 boss 뒤 terminal save가 유효함

#### 저장/마이그레이션

`tests/content-io/save.test.ts` 및 bootstrap 통합 suite:

- resolved route round-trip
- seed가 같아도 저장된 route를 우선하여 복원
- route에 없는 완료 node, 중복 node, 잘못된 episode 순서 거부
- legacy 15노드 save의 승인된 마이그레이션 케이스
- retry 가능한 `FAILED + terminal=false` save 복원
- retry 후 `FAILED, SUCCESS` 이력이 있는 save 복원
- 손상 save만 초기화하고 정상 경계 save는 보존

#### UI/프레젠테이션

`tests/ui/game-flow-screens.test.ts`의 “exact 15-node strip” 계약을 다음으로 교체한다.

- 모델은 활성 episode의 정확히 3개 slot만 보유
- 첫/중간/마지막 단계의 `CLEARED/CURRENT/VEILED` 상태
- `VEILED` 객체에는 label, kind, ref가 없음
- future episode는 상세 노드가 아닌 redacted marker
- 3노드 좌표와 간격이 640×400 안전 영역 안에 있음
- `AVAILABLE`만 interactive하고 `VEILED`는 이벤트 핸들러가 없음

`tests/app/game-flow-presentation.test.ts`:

- 현재의 `nodes.length === 15` 기대 제거
- tutorial/ep001/ep004 경계별 활성 cluster 검증
- 자동 플레이가 수집하는 화면 문자열에 미래 노드 locale 값이 없음
- boss 경계 전/후 모델 diff가 다음 episode만 공개함

#### 전체 런/브라우저

현재 다음 테스트는 15노드 계약을 직접 고정하고 있다.

- `tests/routes/autoplay-15node.test.ts:22-72`
- `tests/app/run-session.test.ts:425-521`
- `tests/engine/run-layer.test.ts:211-228`
- `tests/browser/br04-turbo-run.spec.ts:25-70`
- `tests/e2e/full-run.headless.test.ts:347-390`

canonical 구조 결정 후 파일명과 기대 노드 수, encounter/event 개수, `Math.floor(nodeIndex / 5)` 방식의 act 계산을 함께 교체해야 한다.

브라우저 회귀에는 다음 checkpoint를 추가한다.

1. 새 런 tutorial Combat 화면
2. tutorial Boss 직전
3. tutorial Boss 완료 후 ep001 reveal
4. ep001 Boss 완료 후 ep004 reveal
5. save reload 직후 동일 fog 상태

각 checkpoint에서 screenshot뿐 아니라 DOM/모델 측 미래 문자열 비노출, 콘솔 오류, 누락 에셋, ticker 정리까지 검사한다. 기존 BR-04는 전체 런과 엔딩만 검증하여 strip/fog의 시각 회귀를 잡지 못한다.

### 4.4 완료 정의

다음 조건을 모두 만족할 때 본 차이점은 해소된 것으로 본다.

- [ ] canonical 구조에 대한 ADR이 승인되었다.
- [ ] fresh run은 데이터 순서와 무관하게 tutorial에서 시작한다.
- [ ] 모든 resolved episode는 정확히 `Combat → Event → Boss`다.
- [ ] tutorial → ep001 → ep004 순서가 schema와 엔진 테스트로 강제된다.
- [ ] 활성 episode의 3슬롯만 상세 표시된다.
- [ ] 미래 node의 label, kind, ref가 UI 모델에도 존재하지 않는다.
- [ ] boss 완료가 명시적 episode clear/unlock 전이를 만든다.
- [ ] episode 경계에서 저장·새로고침해도 동일 위치와 공개 상태가 유지된다.
- [ ] retry 가능한 패배와 retry 성공 save가 정상 복원된다.
- [ ] 같은 seed는 같은 route, 다른 production run은 새 seed를 사용한다.
- [ ] 후보 풀을 사용한다면 모든 후보가 도달 가능하고 모든 route가 종결 가능하다.
- [ ] Vitest, content validation, typecheck, browser checkpoint가 모두 통과한다.

---

## 5. 감사 결론

현재 코드는 **고정된 15노드 선형 런으로서는 내부적으로 일관적**이며, 배열 배치 덕분에 tutorial → ep001 → ep004 순서도 실제로 진행된다. 그러나 기획 발화가 요구하는 에피소드별 3단계 구조, 명시적 에피소드 해금, 국소 3노드 공개, 정보 비노출형 Fog-of-War, 런별 발견감은 구현되어 있지 않다.

가장 먼저 해결해야 할 문제는 UI가 아니라 **canonical run의 수량과 의미**다. 이를 확정하지 않은 채 15노드 렌더러만 3개로 자르면 시각적 증상은 줄어들지만 진행 명세의 불일치는 남는다. 반대로 episode/slot 계약을 먼저 세우면, 고정 9노드 MVP와 후보 풀 기반 로그라이트 확장을 같은 구조에서 단계적으로 제공할 수 있다.

감사 시점의 현행 계약 확인을 위해 아래 targeted suite를 실행했으며 **5 files / 24 tests가 통과**했다.

```text
corepack pnpm vitest run tests/ui/game-flow-screens.test.ts tests/app/game-flow-presentation.test.ts tests/engine/run-layer.test.ts tests/app/run-session.test.ts tests/routes/autoplay-15node.test.ts
```

테스트 통과는 목표 명세 충족을 뜻하지 않는다. 현재 테스트 다수가 15노드·5노드 에피소드·전역 index 계약을 그대로 고정하고 있기 때문이다. 실행 환경은 Node 24였고 `package.json`의 지원 범위는 Node 22이므로, 실제 구현 변경 후 최종 gate는 지원 버전에서도 다시 실행해야 한다.

**Protocol status**: Episode Progression & Node Visibility Audit Protocol Initialized and executed.
