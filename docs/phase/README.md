# 🕵️‍♂️ [던전 수사 조서] 단계별 마스터 프롬프트 패키지 (Phase Pipeline Index)

본 디렉토리(`docs/phase/`)는 **[던전 수사 조서 (던전탐정 김태훈)]** 개발을 위한 단계별 프롬프트 모음입니다.
기획자(Game Designer)가 **코드 수정 없이 JSON 데이터를 추가/수정**하고, **이미지 및 오디오 애셋을 교체하여 게임을 제작/튜닝**할 수 있는 아키텍처를 AI 코딩 에이전트가 생성 및 검증하도록 설계되었습니다.

> **v1.1 (2026-08-02) 검증 갱신** — 본 패키지 전량을 저장소의 정본 기획/개발 문서와 대조해 수치·용어·구조를 교정했습니다. 교정 내역은 각 파일 하단의 「검증 로그」 절에 있습니다.

---

## 📚 문서 위계 (프롬프트가 따라야 할 근거의 순서)

프롬프트와 정본 문서가 충돌하면 **항상 아래 표의 위쪽이 이깁니다.** 본 패키지는 정본의 요약·번역일 뿐 새로운 결정을 만들지 않습니다.

| 순위 | 문서 | 지위 |
|---|---|---|
| 1 | `던전수사조서_구현계획서_개발관점_v1.0_260802.md` | **개발 정본** — 스택·아키텍처·스키마·판정 알고리즘·테스트·마일스톤의 최종 결정 |
| 2 | `던전수사조서_구현계획서_기획관점_v1.0_260802.md` | **기획 정본** — 콘텐츠 범위·애셋 물량·캐스트·컷 순서 |
| 3 | `던전_수사_조서_심문엔진_일반화_기획서_v2.0_260726_1.md` | 참고 1 — 일반화 방법론 원전. 채택/축소/미채택 판단은 개발 정본 부록 D를 따름 |
| 4 | `던전탐정_김태훈_구현설계서_애셋표기판.md` | 참고 2 — **애셋 방법론(표기법·PC-98 제약·파츠 오버레이·AI 아트 4단계)만 차용.** 캐릭터 캐스트(코볼트·미믹·픽시)와 화면 목록(크레이지 보드·자판기·암시장·휴게실)은 **본 빌드 범위 아님** |

⚠️ 참고 2의 캐스트·화면을 프롬프트에 다시 끌어오지 마세요. 기획 정본 §8.2에서 명시적으로 폐기된 목록입니다.

---

## 📌 파이프라인 목차 및 실행 순서

각 단계의 프롬프트 파일(.md)을 순서대로 AI에 전달하여 프로젝트를 구축 및 검증하세요:

| 파일명 | 마일스톤 | 핵심 생성 및 검증 내용 |
|---|---|---|
| 📄 [phase0_system_architecture.md](phase0_system_architecture.md) | **M0** | AI 시스템 역할 정의, 5계층 아키텍처 + R-1~R-6, Zero-Code-Change 제약, 확정 스택 |
| 📄 [phase1_engine_schema_loader.md](phase1_engine_schema_loader.md) | **M0~M1** | Zod 스키마, 3축 상태 모델, 순수 함수 판정 엔진(10단계), 조합표, 데이터 로더 |
| 📄 [phase2_interrogation_ui_image_slot.md](phase2_interrogation_ui_image_slot.md) | **M1** | 640×400 도트 스테이지, 심문·조서 화면, 기획자 애셋 워크벤치 |
| 📄 [phase3_live_tuner_workbench.md](phase3_live_tuner_workbench.md) | **M1~M2** | 개발자 콘솔(백틱), `balance.json` 라이브 튜너, 12 QA 픽스처 인게임 재생 |
| 📄 [phase4_state_machine_ai_fallback.md](phase4_state_machine_ai_fallback.md) | **M2~M4** | 전투 상태 머신, Outcome 평가 순서, DTO 경계, 무정지 폴백 AI 파이프라인 |
| 📄 [phase5_verification_and_simulators.md](phase5_verification_and_simulators.md) | **M1~M3** | Vitest 12 픽스처, 27셀 매트릭스, 플래그 26 시나리오, 누설·아키텍처 검사 |
| 📄 [phase6_asset_verification_and_completion.md](phase6_asset_verification_and_completion.md) | **M3~M5** | 애셋 교체 검증, 무코드 사건 확장 게이트, 15노드 완주 & 최종 폴리싱 |

마일스톤 배분(개발 정본 §15): **M0 10% / M1 25% / M2 20% / M3 20% / M4 15% / M5 10%.**

---

## 💡 프로젝트 핵심 아키텍처 요약 (AI 지침)

1. **5계층 아키텍처 (TruthGraph → KnowledgeState → GameRule → DialogueRenderer → Presentation)**
   - 의존성은 아래에서 위로 단방향. 상위 계층은 하위 계층을 직접 참조할 수 없음.
   - **R-6**: 어떤 계층도 사건·용의자·증거 ID를 코드 상수로 갖지 않음 (`test_no_hardcoded_content_ids`).
2. **아키텍처 3원칙**
   - **엔진이 심판, AI는 배우** — 판정·자원·승패에 AI 출력이 관여하는 코드 경로가 존재하지 않음.
   - **진실과 지식의 분리** — `truth_relation`을 상태 축으로 복사하는 코드 금지(불변식 I-5).
   - **화이트리스트 DTO** — UI로 나가는 데이터는 "지우는" 방식이 아니라 "담는" 방식.
3. **Zero Engine Code Change (사건 추가 시 엔진 수정 0건)**
   - EP001·EP004 투입 커밋의 diff가 `content/`·`assets/` 밖을 건드리지 않음을 **git으로 측정**(M3 게이트).
4. **결정론**
   - 모든 무작위는 `run_seed` 파생 스트림. `engine/**`에서 `Date.now`·`Math.random`·`fetch`·`window`·`document`·`pixi.js`·`howler` 사용 금지.
   - `(run_seed, 입력 시퀀스)`만으로 판정 로그가 바이트 동일하게 재현됨.
5. **무빌드 라이브 튜닝**
   - `balance.json`은 번들 import가 아니라 **런타임 fetch** — 파일 수정 + 새로고침이 곧 반영. M5 밸런싱은 이 파일과 case 수치 필드만 수정(코드 동결).
6. **무정지 AI 폴백**
   - 검증 실패 시 재시도 1회 → 동일 `claim_id` 폴백 대사로 전환. 타자기 연출이 동일하므로 플레이어는 전환을 인지하지 못함.

---

## 🧾 이 패키지의 검증 상태 (2026-08-02)

| 항목 | 상태 |
|---|---|
| 저장소 구현 코드 | **없음.** `src/`·`package.json`·`content/` 미생성 — 본 패키지는 아직 "실행 전 프롬프트"임 |
| 존재하는 산출물 | `dungeon_detective_workbench.html` (튜너·12 QA 프로토타입), `Kim_detective/심문화면 애셋 목업.dc.html` + `image-slot.js`, `GameBase/던전수사조서 UI 목업.dc.html` |
| 목업의 지위 | **기획 워크벤치(제작 단계 도구)**이지 게임 런타임이 아님. PixiJS 빌드는 이 HTML을 이식하지 않고 §7 사양으로 새로 구현 |

목업에서 확인된 실측 슬롯 규격(Phase 2·6의 근거):
`bg-room` 640×400 · `portrait-base` 196×216 @(222,40) · `portrait-parts` 96×40 @(272,84) · `fg-desk` 640×118 @(0,282) · `card-art-1~3` 56×44 · `ev-1~3` 36×36 · `icon-composure`/`icon-coercion` 16×16 · `partner`.
