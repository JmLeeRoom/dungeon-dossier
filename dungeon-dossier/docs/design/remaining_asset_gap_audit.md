# Workbench·코드 기준 잔여 애셋 갭 감사

| 항목 | 내용 |
|---|---|
| 문서 목적 | Workbench의 16개 슬롯, 실제 `assets/`, runtime catalog, UI binding, 화면 renderer, autoplay를 교차 점검하여 아직 제작·승인·연결되지 않은 애셋을 구분한다. |
| 기준 일자 | 2026-08-09 (Asia/Seoul) |
| 주 대상 | 30~60초 제출 영상과 현재 9-node 기본 플레이 경로 |
| 코드 기준 | `dungeon-dossier/` 현재 작업 트리 |
| 관련 정본 | [`png_asset_integration_and_ui_binding_design.md`](./png_asset_integration_and_ui_binding_design.md) |

---

## 0. 결론

Workbench의 canonical 16개 슬롯은 모두 PNG가 연결되어 있다. 그러나 이것은 **심문 화면의 대표 배치 16칸이 채워졌다는 뜻**이지, 게임 전체 애셋이 완성됐다는 뜻은 아니다.

현재 잔여 갭의 핵심은 다음과 같다.

1. `assets/sfx/`, `assets/bgm/`에 실제 음원이 없어 논리적으로 선언된 **23개 사운드가 모두 무음**이다.
2. BEST 판정 클라이맥스의 `direction/ending/polaroid`를 포함한 **결과 연출용 optional 이미지 4개가 catalog와 파일에 없다.**
3. 시작 덱에 들어가는 `card_recover_breathe`를 포함해 **카드 3종이 전용 일러스트 없이 legacy 생성 이미지**를 쓴다.
4. 용의자 6명은 production 3상태 이미지가 없고, 그중 오크·드워프·타락한 용사는 기본 seed 경로에 실제 등장한다.
5. 수사 보드의 전투/보스 사진은 9개 encounter 후보 중 4개만 연결되어 있다.
6. EP001/EP004 컷씬은 승인된 `scene0~2`가 있어도 beat 매핑이 없어 legacy 배경을 쓴다.
7. 최종 TRUE/NORMAL/BAD 엔딩 3종은 illustration seam만 있고 실제 키가 없다.
8. 실패 사유 4종 이미지는 파일은 있으나 모두 `legacy-fallback` 생성 placeholder다.
9. `SHAKEN` 진술 태그는 6개 상태 중 유일하게 전용 PNG가 없다.
10. 승인 PNG 14개는 이미 전달됐지만 정체·장면·타이밍 승인이 없어 화면에 연결되지 않았다.

따라서 autoplay의 `missingAssetKeys: []`는 **파일 로딩 오류가 없다는 뜻일 뿐**이다. legacy placeholder, optional sprite 부재, Graphics 대체, 승인 대기 파일은 이 배열에 잡히지 않는다.

### 0.1 판정 용어

| 판정 | 의미 |
|---|---|
| `COMPLETE` | production 파일, catalog, binding, 실제 renderer 사용이 모두 확인됨 |
| `MISSING_FILE` | 코드가 논리 ID 또는 slot을 선언하지만 실제 미디어 파일이 없음 |
| `LEGACY_FALLBACK` | 파일은 있으나 catalog상 `legacy-fallback` 또는 생성 placeholder |
| `UNBOUND` | 승인 파일은 있으나 콘텐츠 ID/화면/타이밍 매핑이 없어 미사용 |
| `CODE_FALLBACK` | 파일이 없을 때 Graphics/Text 도형으로 대체되어 오류 없이 지나감 |
| `CODE_UI` | 현재 설계상 이미지가 아니라 코드 도형으로 그리는 UI; 누락으로 단정하지 않음 |

---

## 1. 시나리오 및 autoplay 기준 정정

### 1.1 사건명

- `황금 엘릭서 믹스커피 절도`는 EP001이 아니라 `tutorial`이다. 근거: `content/cases/tutorial/case.json:4-7`, `content/common/strings.ko.json:374`.
- 실제 EP001은 `붉은 장부와 사라진 보급품`이다. 근거: `content/cases/ep001/case.json:4-7`, `content/common/strings.ko.json:375`.

따라서 `/?autoplay=1&mode=watch`를 처음부터 실행하면 EP001 심문이 아니라 튜토리얼의 물컹이 심문부터 시작한다.

### 1.2 기본 seed 실제 9-node 경로

`DEFAULT_RUN_SEED = 20_260_803`과 현재 `SEEDED_ONE` 선택 규칙을 적용한 경로는 다음과 같다.

```text
1. enc_tutorial_slime
2. event_tutorial_choice
3. enc_tutorial_minotaur
4. enc_ep001_orc
5. event_ep001_forensic_sweep
6. enc_ep001_succubus
7. enc_ep004_dwarf
8. event_ep004_broker_canvass
9. enc_ep004_fallen_hero
```

근거: `src/app/gameRunState.ts:21`, `src/engine/run/NodeStrip.ts:25-96`, `content/common/run-strip.json`.

이 경로에서 production 용의자는 물컹이·미노타우로스·서큐버스이고, 오크·드워프·타락한 용사는 legacy placeholder다.

### 1.3 autoplay 보고서 주의

2026-08-09 로컬 Chromium에서 `/?autoplay=1&mode=turbo` 기본 seed를 실제 실행한 결과는 다음과 같았다.

- 전체 9개 node와 TRUE ending까지 진행
- `missingAssetKeys: []`
- `consoleErrors: []`
- 그러나 `AUTOPLAY FAIL` — seeded 실제 경로를 unseeded canonical 첫 후보 순서와 비교하여 node-order mismatch 발생

`driver.ts`는 `console.warn` 문자열에 `asset`이 포함될 때만 누락 배열에 넣는다(`src/dev/autoplay/driver.ts:194-224,375-377`). `report.ts`는 그 배열이 비어 있으면 asset gate를 통과시킨다(`src/dev/autoplay/report.ts:279-284`). 한편 예상 node는 seed 없이 만든 canonical route다(`src/dev/autoplay/report.ts:82-108,194-253`).

즉 현재는 다음 두 문장을 모두 참으로 봐야 한다.

- `missingAssetKeys = 0`이어도 제작 애셋 갭은 남아 있다.
- 기본 seeded autoplay의 `FAIL`은 현재 asset 실패가 아니라 route expectation 불일치가 먼저 발생한 것이다.

추가로 `mode=video`의 코드상 목표는 59초가 아니라 150±15초다(`src/dev/autoplay/report.ts:13-29`). 59초 제출본은 watch/record 원본에서 별도로 커트하거나 video pacing 계약을 따로 바꿔야 한다.

---

## 2. Workbench가 보여주는 것과 보여주지 않는 것

### 2.1 확인된 COMPLETE 범위

Workbench와 shipping manifest의 16개 canonical slot은 다음 범위다.

- 취조실 배경 1
- 용의자 base/upset/lose 3
- 책상 전경 1
- 카드 base 1 + 대표 card art 3
- 대표 evidence 3
- 평정심/강압 HUD icon 2
- 파트너 active/used 2

계약 근거는 `src/ui/core/workbenchManifestContract.ts:3-20,35-57`, 배치 근거는 `workbench/model.mts:115-263`, 실제 파일명은 `assets/asset_manifest.json`이다. 로컬 Workbench에서도 16개 모두 `채움`으로 확인됐다.

### 2.2 Workbench 밖의 범위

다음은 canonical 16 slot에 포함되지 않는다.

- BGM/SFX/stinger
- run board 배경·사진·known event thumbnail
- event/cutscene 배경과 인물
- reward/title/dossier/final ending/dead scene
- 결과 direction의 optional art 4종
- 카드 art 03~05와 추가 카드 전용 art
- evidence art 03~05와 콘텐츠별 고유 evidence art
- tag state plate 전체 관리

Workbench 저장 대상도 PNG category 폴더에 한정되며 `fonts`, `bgm`, `sfx`는 대상이 아니다(`workbench/model.mts:1500-1524`).

### 2.3 Workbench 표시를 누락 판정으로 쓰면 안 되는 이유

1. shipping preview는 catalog PNG를 state 밖에서 표시한다(`workbench/shipping-preview.mts:35-76`). 반면 캐릭터 편집 state는 처음에 모든 character image가 빈 객체로 시작한다(`workbench/model.mts:443-457`). 따라서 Character Parts 패널의 `비어 있음`은 runtime 파일 부재와 같은 뜻이 아니다.
2. stage 안내문은 선택 캐릭터와 무관하게 `하피`로 하드코딩되어 있다(`workbench/index.html:83-100`). 기본 선택은 `물컹이`다(`workbench/model.mts:34-52`). 화면의 이름과 보이는 portrait가 다를 수 있다.
3. Workbench는 좌표·교체·manifest 도구이지, 모든 콘텐츠 ID의 binding coverage를 검사하는 도구가 아니다.

---

## 3. 59초 제출 영상에 바로 영향을 주는 P0

| 항목 | 현재 화면 | 판정 | 필요한 작업 | 근거 |
|---|---|---|---|---|
| 심문 BGM·핵심 SFX | 모든 호출이 silent no-op | `MISSING_FILE` | 최소 `bgm_interrogation`, `typewriter`, `typewriter_return`, `card_snap`, `paper_flip`, `shield_break`, `stamp` 또는 `sting_confession` 제작·등록 | `src/audio/soundRegistry.ts:3-38,49-59,98-118` |
| BEST 결과 폴라로이드 | 빈 폴라로이드 판과 벡터 실루엣만 표시 | `CODE_FALLBACK` + `MISSING_FILE` | `direction/ending/polaroid` 추가. logical 표시 영역 216×196, 2× render 원본 권장 432×392 | `src/ui/screens/interrogation/directions.ts:148-200`; BEST→`O_FULL_STATEMENT`는 `src/app/gameAudio.ts:20-31` |
| `card_recover_breathe` | 전용 art 대신 `QUERY ART` 생성 placeholder | `LEGACY_FALLBACK` | 256×256 전용 회복/호흡 일러스트와 card-ID binding 추가 | `content/common/cards.json:103-114,183-190`; `src/app/uiAssetBindings.ts:127-156`; `createInterrogationScreen.ts:91-108,381-390` |
| EP001 첫 심문을 기본 autoplay로 촬영 | 기본 seed가 고블린이 아니라 오크를 선택하고 ORC 실루엣 표시 | `LEGACY_FALLBACK` | 오크 base/upset/lose 512×512 production 3장 + board photo 또는 촬영 경로를 production 캐릭터로 고정 | `content/common/run-strip.json`; `src/app/uiAssetBindings.ts:53-65,77-94` |
| EP001 감식 컷씬까지 포함 | legacy `ROOM SEPIA` 배경 노출 | `UNBOUND` + `LEGACY_FALLBACK` | `cutscene_ep001_forensic_open` beat와 `bg/event/scene0~2` 중 승인된 장면을 명시 매핑 | `content/cases/ep001/case.json:1815-1853`; `src/app/uiAssetBindings.ts:283-287,378-387` |

현재 파일만으로 화면 완성도가 가장 안전한 용의자 구간은 물컹이·미노타우로스·고블린·서큐버스다. 다만 어느 구간을 선택해도 오디오, 결과 폴라로이드, 시작 덱 회복 카드 문제는 별도로 남는다.

---

## 4. 전체 잔여 애셋 매트릭스

### 4.1 실제 파일이 없는 항목

| 화면/기능 | 논리 ID 또는 대상 | 수량 | 현재 fallback | 우선순위 |
|---|---|---:|---|---|
| SFX | `typewriter`, `typewriter_return`, `stamp`, `card_snap`, `paper_flip`, `shield_break`, `door_knock`, `knock_triple`, `qte_success`, `qte_fail`, `shuffle_bubble`, `shredder`, `crt_switch` | 13 | 무음 | P0 |
| BGM | `bgm_interrogation`, `bgm_boss`, `bgm_ambient`, `bgm_ending` | 4 | 무음 | P0 |
| stinger | `sting_confession`, `sting_arrest`, `sting_collapse`, `sting_gavel`, `sting_clock`, `sting_file_close` | 6 | 무음 | P0/P1 |
| 결과 direction art | `direction/ending/polaroid`, `transfer-stamp`, `counsel-card`, `infirmary-ceiling` | 4 | Graphics 도형 | polaroid P0, 나머지 P1 |
| 카드 전용 art | `card_recover_breathe`, `card_recover_pace`, `card_special_notice` | 3 | 질문/압박 legacy 일러스트 재사용 | P0/P1 |
| 용의자 production state | 하피, 오크, 드워프, 사이클롭스, 타락한 용사, 켄타우로스의 base/upset/lose | 18 | `portrait/<name>/*` 생성 실루엣 | P1 |
| encounter board photo | 하피, 오크, 드워프, 사이클롭스, 타락한 용사 | 5 | 사진 없이 핀·텍스트만 표시 | P1 |
| 최종 ending illustration | TRUE, NORMAL, BAD | 3 | 단색 배경 + 텍스트 | P1 |
| tag plate | `SHAKEN` | 1 | Graphics plate + `!` | P2 |

#### 오디오 경로 계약

필요한 정확한 파일 경로는 다음과 같다.

```text
assets/sfx/typewriter.ogg
assets/sfx/typewriter_return.ogg
assets/sfx/stamp.ogg
assets/sfx/card_snap.ogg
assets/sfx/paper_flip.ogg
assets/sfx/shield_break.ogg
assets/sfx/door_knock.ogg
assets/sfx/knock_triple.ogg
assets/sfx/qte_success.ogg
assets/sfx/qte_fail.ogg
assets/sfx/shuffle_bubble.ogg
assets/sfx/shredder.ogg
assets/sfx/crt_switch.ogg

assets/bgm/bgm_interrogation.ogg
assets/bgm/bgm_boss.ogg
assets/bgm/bgm_ambient.ogg
assets/bgm/bgm_ending.ogg
assets/bgm/sting_confession.ogg
assets/bgm/sting_arrest.ogg
assets/bgm/sting_collapse.ogg
assets/bgm/sting_gavel.ogg
assets/bgm/sting_clock.ogg
assets/bgm/sting_file_close.ogg
```

현재 두 폴더에는 `.gitkeep`만 있다. 파일이 없으면 `resolveSoundDefinitions()`가 해당 ID를 등록하지 않고 `AudioPlayer.play*()`는 false를 반환하므로 오류 없이 무음으로 진행한다.

또한 dead-scene 4개 stinger는 `DEAD_SCENE_TABLE`에 `audioCue`가 선언되어도 `toDeadSceneModel()`과 `mountDeadScene()`에서 전달·재생하지 않는다(`src/app/deadScene.ts:28-68,85-132`, `src/app/bootstrap.ts:1101-1143`). 해당 4개 OGG는 **파일 추가와 함께 wiring 수정도 필요**하다.

#### 결과 direction 이미지 권장 규격

| key | logical 표시 영역 | 2× render 기준 권장 원본 |
|---|---:|---:|
| `direction/ending/polaroid` | 216×196 | 432×392 |
| `direction/ending/transfer-stamp` | 340×252 | 680×504 |
| `direction/ending/counsel-card` | 218×116 | 436×232 |
| `direction/ending/infirmary-ceiling` | 456×254 | 912×508 |

네 key는 `addOptionalSprite()`를 사용하므로 catalog에 없더라도 경고 없이 생략된다(`src/ui/screens/interrogation/directions.ts:131-146,178-183,216-221,328-333,377-382`).

### 4.2 production 대신 legacy fallback을 쓰는 항목

| 화면/기능 | 현재 키 | 상태 | 교체 조건 |
|---|---|---|---|
| 실패 사유 4종 | `dead/과로/기본`, `dead/징계/기본`, `dead/시한/기본`, `dead/미제/기본` | 1280×440 생성 실루엣, catalog `legacy-fallback` | 동일 의미·규격의 production PNG 4장 |
| 미승인 용의자 6명 | `portrait/<name>/base|upset|lose` | 512×512 생성 실루엣 | 승인 production identity + 3상태 세트 |
| 미승인 카드 3종 | `card/질문/일러`, `card/압박/일러` | `QUERY ART`/`PRESSURE ART` 생성 이미지 | card ID별 전용 art |
| EP001 컷씬 배경 | `배경/심문실/세피아` | `ROOM SEPIA` 생성 이미지 | beat→scene production mapping |
| EP004 컷씬 배경 | `배경/심문실/마젠타` | legacy 생성 이미지 | beat→scene production mapping |

실패 화면의 선택은 `src/app/deadScene.ts:40-68`, catalog 상태는 `src/ui/core/generated/runtimeAssetCatalogData.ts:244-290`에 기록되어 있다.

### 4.3 전달됐지만 아직 화면에 연결되지 않은 승인 PNG 14개

| 묶음 | 수량 | 현재 상태 | 필요한 결정 |
|---|---:|---|---|
| `bg/event/scene0~2` | 3 | catalog에는 active, 실제 authored beat에는 미연결 | Narrative/Game Design의 beat별 1:1 승인 |
| `idle/bensi/{base,upset,lose}` | 3 | production 파일 존재, suspect identity 미승인 | 어느 콘텐츠 인물인지 alias 승인 |
| `idle/kimyongsa/{base,upset,lose}` | 3 | production 파일 존재, suspect identity 미승인 | 타락한 용사 등으로 임의 추정하지 말고 승인 |
| `ui/photo/{bensi,kimyongsa}` | 2 | board photo 파일 존재, node identity 미승인 | encounter ref 매핑 승인 |
| `ui/stamp/{logic,pushy}` | 2 | 620×620 대형 stamp, renderer timing/의미 미결정 | 카드 stamp와 구분된 화면 feedback 사용처 승인 |
| `ui/system/00` | 1 | 415×310 복합 패널, frame metadata 없음 | 통이미지 사용 또는 atlas frame 계약 결정 |

정체가 승인되지 않은 `bensi`, `kimyongsa`를 임의로 하피·드워프·타락한 용사에 연결해서는 안 된다. 코드도 이를 명시적으로 제외한다(`src/app/uiAssetBindings.ts:11-24,53-65`).

### 4.4 보드·증거·컷씬의 coverage gap

#### 수사 보드

`BOARD_NODE_PHOTO_ASSET_KEYS`에는 slime, minotaur, goblin, succubus 4개만 있다(`src/app/uiAssetBindings.ts:241-259`). 나머지 encounter는 `artAssetKey` 자체가 생략되고 renderer는 사진을 그리지 않는다(`src/app/gameFlowPresentation.ts:103-113`, `src/ui/screens/strip/createRunStripScreen.ts:186-199`).

또한 authored event 7종에는 known-node thumbnail binding이 없다. 현재 known event card는 핀·역할·텍스트만 보인다. 이는 오류는 아니지만 보드 완성도를 높이려면 generic known-event plate 또는 event별 thumbnail 정책이 필요하다.

#### 증거

전체 증거 24종은 6개 범용 폴라로이드에 매핑된다(`src/app/uiAssetBindings.ts:179-231`, `tests/ui/asset-catalog-bindings.test.ts:139-154`). EP001 증거 8종도 4개 그림만 공유한다.

이는 runtime 누락이 아니라 명시적 many-to-one 설계다. 다만 제출 영상에서 증거 고유성이 중요하다면 EP001 8종 전용 그림을 별도 P2 아트 작업으로 잡아야 한다.

증거 선택 파우치 자체는 PNG port가 없고 36×36 Graphics 슬롯에 증거의 등급 문자만 표시한다(`src/ui/widgets/evidenceTray.ts:37-89`). 위 6개 폴라로이드는 증거를 카드에 부착한 뒤 카드의 `evidence` layer에서만 표시된다(`src/ui/screens/interrogation/createInterrogationScreen.ts:381-399`). 따라서 제출 영상에서 “증거를 골랐다”는 시각적 인지가 약하다면, 새 증거 파일을 더 만드는 것보다 먼저 tray model에 `artAssetKey`를 전달하고 thumbnail renderer를 추가해야 한다.

#### 컷씬 portrait 합성

컷씬 `addArt()`는 asset 해석 성공 여부와 무관하게 placeholder를 먼저 깔고 그 위에 sprite를 올린다(`src/ui/screens/cutscene/createCutsceneOverlay.ts:75-97,279-299`). 투명 portrait의 빈 픽셀 뒤로 placeholder 패널·실루엣이 비칠 수 있다. 이 항목은 새 파일이 아니라 renderer 합성 수정 대상이다.

### 4.5 final ending과 code-only 화면

- TRUE/NORMAL/BAD ending 정의는 모두 `illustrationAssetKey`가 없다(`src/app/gameRunState.ts:203-231`). renderer는 optional key가 없으면 이미지 없이 텍스트만 그린다(`src/ui/screens/ending/createEndingScreen.ts:16-35`).
- reward screen은 asset port가 없고 카드·등급·버튼 전체가 Graphics/Text다(`src/ui/screens/reward/createRewardScreen.ts`).
- title과 dossier도 현재 Graphics/Text 중심이다(`src/ui/screens/title/createTitleScreen.ts`, `src/ui/screens/dossier/createDossierScreen.ts`).
- 심문 status strip은 Graphics 판 위에 텍스트로 그리며 CP 토큰은 production icon이 아니라 네이티브 `☕` 이모지를 반복한다(`src/ui/screens/interrogation/createInterrogationScreen.ts:349-365`). 녹화 OS/폰트에 따른 외형 차이를 없애려면 Workbench의 composure icon 또는 별도 CP pip asset을 사용하도록 바인딩해야 한다.

이 화면들은 코드상 동작하므로 자동으로 `MISSING_FILE`로 분류하지 않는다. production art로 교체하려면 먼저 화면 model에 asset key를 추가하는 설계 작업이 필요하다.

---

## 5. 작업 우선순위

### P0 — 59초 제출본 전에

1. 심문 BGM 1개와 카드/타자/판정 핵심 SFX를 우선 공급한다.
2. BEST 클라이맥스용 `direction/ending/polaroid`를 추가한다.
3. 초기 덱 `card_recover_breathe` 전용 256×256 art를 추가한다.
4. EP001을 촬영한다면 기본 seed의 오크를 피하도록 경로를 고정하거나 오크 3상태 production art를 추가한다.
5. EP001 감식 컷씬을 넣는다면 `scene0~2` 중 승인 장면을 beat에 연결한다.

### P1 — 전체 기본 경로 완성

1. 오크·드워프·타락한 용사 3상태 art와 board photo를 우선 추가한다.
2. 나머지 하피·사이클롭스·켄타우로스 production 세트를 완료한다.
3. 결과 direction의 나머지 3개 art를 추가한다.
4. TRUE/NORMAL/BAD ending art 3종과 dead production art 4종을 추가한다.
5. dead-scene stinger wiring을 연결하고 전체 23개 audio를 채운다.

### P2 — 표현력 보강

1. `SHAKEN` tag plate를 추가한다.
2. known event board thumbnail 정책을 정한다.
3. EP001 증거별 고유 art 필요 여부를 결정한다.
4. 증거 파우치에 실제 evidence thumbnail을 연결하고, 심문 CP 이모지를 승인 icon/pip로 교체할지 결정한다.
5. reward/title/dossier의 코드 UI를 production art로 바꿀지 결정한다.
6. large stamp와 `ui/system/00`의 사용처를 승인한다.

---

## 6. 완료 판정 체크리스트

### 6.1 파일·catalog

- [ ] 새 PNG가 승인된 naming/key와 source dimension을 가진다.
- [ ] 새 PNG가 runtime catalog에 있고 `legacy-fallback`이 아니다.
- [ ] 필요한 OGG 23개가 exact 경로에 존재한다.
- [ ] capture 경로에서 접근하는 asset key가 모두 catalog에 있다.

### 6.2 binding·renderer

- [ ] content ID → app binding → UI model → renderer 사용이 연결된다.
- [ ] optional direction 4 key를 화면에서 실제로 볼 수 있다.
- [ ] 기본 seed 경로에 `portrait/<name>/*` legacy 실루엣이 없다.
- [ ] 컷씬에 `ROOM SEPIA`/`ROOM MAGENTA`가 노출되지 않는다.
- [ ] final ending 3종이 실제 illustration key를 가진다.
- [ ] transparent cutscene portrait 뒤 placeholder가 비치지 않는다.

### 6.3 검증

```text
corepack pnpm assets:validate
corepack pnpm test -- tests/ui/asset-catalog-bindings.test.ts
corepack pnpm test -- tests/ui/workbench-shipping-preview.test.ts
corepack pnpm test -- tests/audio/sound-registry.test.ts
corepack pnpm build
```

마지막 수동 검수에서는 `missingAssetKeys`만 보지 말고 다음을 함께 확인한다.

- 화면에 `QUERY ART`, `ORC`, `OVERWORK`, `ROOM SEPIA` 같은 생성 placeholder 문자가 보이는가
- 결과 폴라로이드가 빈 회색 판인가
- BGM·카드 snap·타자·판정·자백 stinger가 실제로 들리는가
- board known node에 사진이 비어 있는가
- 증거 선택 파우치가 등급 문자만 보여 주어 선택 대상이 모호하지 않은가
- 심문 CP가 환경 의존 이모지로 보이지 않는가
- final ending이 텍스트만 보이는가

---

## 7. 본 문서에서 수정하지 않은 병행 코드 이슈

이 감사는 애셋 현황을 기록하는 문서이며 다음 코드는 변경하지 않았다.

1. seeded autoplay를 canonical first-candidate 순서로 비교해 발생하는 false `AUTOPLAY FAIL`
2. 59초 제출 요구와 다른 `mode=video` 150±15초 pacing 계약
3. 실제 9-node 실행과 무관하게 HUD에 하드코딩된 `15-NODE CINEMATIC DEMO` 문구(`src/dev/autoplay/hud.ts:178-186`)
4. dead-scene `audioCue` 미전달
5. transparent cutscene portrait 아래 placeholder 잔존

이 다섯 항목은 새 파일을 넣는 것만으로 해결되지 않으므로 별도 구현 작업으로 추적해야 한다.
