# 🕵️‍♂️ [던전 수사 조서] 단계별 마스터 프롬프트 패키지 (Phase Pipeline Index)

본 디렉토리(`docs/phase/`)는 **[던전 수사 조서 (Dungeon Detective Kim Taehoon)]** 개발 및 해상도 전환을 위한 단계별 프롬프트 모음입니다.
기획자(Game Designer)가 **코드 수정 없이 JSON 데이터를 추가/수정**하고, **이미지 및 오디오 애셋을 인게임 UI 상에 직접 드래그 앤 드롭하여 게임을 제작/튜닝**할 수 있는 아키텍처를 AI 코딩 에이전트(Claude, GPT-4o, Antigravity 등)가 완전 자동 생성 및 검증하도록 설계되었습니다.

---

## 📌 파이프라인 목차 및 실행 순서

각 단계의 프롬프트 파일(.md)을 순서대로 AI에 전달하여 프로젝트를 구축, 1280×800 해상도로 확장, 및 검증하세요:

| 파일명 | 마일스톤 | 핵심 생성 및 검증 내용 |
|---|---|---|
| 📄 [phase0_system_architecture.md](file:///d:/NHNhackerton/docs/phase/phase0_system_architecture.md) | **Phase 0** | AI 시스템 역할 정의, 5계층 아키텍처, Zero-Code-Change 제약, 스택 고정 |
| 📄 [phase1_engine_schema_loader.md](file:///d:/NHNhackerton/docs/phase/phase1_engine_schema_loader.md) | **Phase 1** | Zod 스키마, 5계층 타입, 순수 함수 판정 엔진(10단계), 데이터 로더 |
| 📄 [phase2_interrogation_ui_image_slot.md](file:///d:/NHNhackerton/docs/phase/phase2_interrogation_ui_image_slot.md) | **Phase 2** | 640×400 도트 스테이지, `<image-slot>` 드래그앤드롭 슬롯, 취조실 UI |
| 📄 [phase3_live_tuner_workbench.md](file:///d:/NHNhackerton/docs/phase/phase3_live_tuner_workbench.md) | **Phase 3** | 인게임 라이브 튜너(`balance.json`), 대사 에디터, 12 QA 픽스처 테스트 버튼 |
| 📄 [phase4_state_machine_ai_fallback.md](file:///d:/NHNhackerton/docs/phase/phase4_state_machine_ai_fallback.md) | **Phase 4** | 8단계 턴 상태 머신, DTO 경계, 무정지 폴백 AI 파이프라인 |
| 📄 [phase5_verification_and_simulators.md](file:///d:/NHNhackerton/docs/phase/phase5_verification_and_simulators.md) | **Phase 5** | Vitest 12 QA 픽스처, 27셀 매트릭스 시뮬레이터, DTO 누설 검사기 |
| 📄 [phase6_asset_verification_and_completion.md](file:///d:/NHNhackerton/docs/phase/phase6_asset_verification_and_completion.md) | **Phase 6** | 애셋 업로드 검증, 무코드 사건 확장 검증, 15노드 완주 & 폴리싱 |
| 📄 [phase7_comprehensive_gap_audit_and_final_completion.md](file:///d:/NHNhackerton/docs/phase/phase7_comprehensive_gap_audit_and_final_completion.md) | **Phase 7** | 18가지 미구현 갭 전수 감사, 388개 테스트 통과 및 최종 게임 완결 |
| 📄 [prompt_resolution_1280x800.md](file:///d:/NHNhackerton/docs/phase/prompt_resolution_1280x800.md) | **HD Upgrade** | **게임해상도 1280×800 (2배 정수배 업스케일 뷰포트) 전환 프롬프트** |

---

## 💡 프로젝트 핵심 아키텍처 요약 (AI 지침)

1. **5계층 아키텍처 (TruthGraph → KnowledgeState → GameRule → DialogueRenderer → Presentation)**
   - 계층 간 단방향 의존성 엄격 준수. 엔진 코드는 사건 ID 리터럴 문자열 상수를 갖지 않음 (`test_no_hardcoded_content_ids`).
2. **Zero Engine Code Change (사건 추가시 엔진 수정 0건)**
   - 두 번째 사건(`EP001`), 세 번째 사건(`EP004`)을 추가할 때 `src/engine/` 코드를 단 1줄도 고치지 않고 `content/cases/` 데이터만으로 작동.
3. **1280×800 HD 픽셀 업스케일 모드**
   - 640×400 도트 가상 좌표계를 유지하며 2배 정수배 업스케일(`scale = 2`) 및 `NEAREST` 필터를 적용해 깨끗한 픽셀 아트를 표시.
4. **실시간 애셋 드래그 앤 드롭 (`<image-slot>`)**
   - 캔버스 뷰포트 상의 이미지 슬롯(취조실 배경, 용의자 표정 파츠, 증거 아이콘, 카드 프레임 등)에 PNG 파일을 드롭하면 LocalStorage/IndexedDB에 즉시 보존.
5. **무빌드 라이브 튜닝 (Live Tuner Workbench)**
   - 인게임 GUI 튜너에서 `balance.json` (평정심, 강압 수사, 피해량, 드로우 수) 수치를 수정하고 즉시 테스트 및 JSON 내보내기 가능.
