# 📑 던전 수사 조서: 에셋·캐릭터·카드 시스템 종합 리팩토링 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 코딩 에이전트(Antigravity, Claude, GPT-4o 등)에 전달하여 에셋 규격 통일, 에셋 워크벤치 변형/고정 기능, 캐릭터 상태 파츠 및 파트너 쿨다운, 5계층 카드의 인터랙티브 레이어링 및 드래그 앤 드롭 시스템을 자동 구축하고 테스트합니다.

```markdown
Refactor the Asset Pipeline, Asset Workbench, Character State Machine, Partner Skill System, and 5-Layer Interactive Card Engine for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 📐 에셋 표준 규격 명세 (Standard Asset Dimensions)

다음 해상도 규격을 Zod 스키마, UI 렌더러, 에셋 매니페스트 및 테스트 픽스처에 엄격히 반영하세요:

| 에셋 분할 | 에셋 ID / 파츠명 | 해상도 (Width × Height) | 비고 |
|---|---|---|---|
| **배경 & 전경** | `bg_interrogation` (취조실 배경) | `1280 × 800 px` | 메인 스테이지 2x HD 배경 |
| | `desk_foreground` (책상 전경) | `1280 × 236 px` | 화면 하단 레이어드 책상 전경 |
| **용의자** | `suspect_base` (용의자 베이스) | `512 × 512 px` | 용의자 신체 기본 프레임 |
| | `suspect_state_parts` (상태 파츠) | `512 × 512 px` | 기존 expression → state_parts로 변경 |
| **파트너** | `partner` (파트너 베이스/used) | `512 × 512 px` | base / used 두 상태 공통 크기 |
| **카드 파츠** | `card_base` (카드 기본 템플릿) | `640 × 725 px` | 카드 최하단 베이스 레이어 |
| | `card_illust` (카드 일러스트 1, 2, 3) | `256 × 256 px` | 카드 중앙 일러스트 레이어 |
| **증거 및 아이콘** | `evidence` (증거 1, 2, 3) | `128 × 128 px` | 증거 아이콘 및 카드 결합 오버레이 |
| | `icon_composure` (평정심 아이콘) | `32 × 32 px` | UI 멘탈 렌더링 아이콘 |
| | `icon_coercion` (강압 아이콘) | `32 × 32 px` | UI 압박 렌더링 아이콘 |

---

## 2. 🛠️ 에셋 워크벤치 (Asset Workbench) - 이미지 변형 및 고정

**목표 파일**: `workbench/` 및 `src/dev/assetWorkbench.ts`

1. **Transform Controller (이동 / 회전 / 크기 조절)**:
   - 워크벤치 상의 에셋 이미지에 드래그 기즈모(Transform Gizmo) 제공:
     - **이동 (Position)**: `x`, `y` 좌표 드래그 이동.
     - **회전 (Rotation)**: 회전 핸들 드래그 (도/라디안 단위 계산).
     - **크기 (Scale)**: 코너 스케일 핸들 드래그 (`scaleX`, `scaleY` 조절).
2. **Lock State Toggle (상태 고정/확정)**:
   - "확정 / 고정 (Lock)" 버튼 추가.
   - 고정 시 (`isLocked: true`) 워크벤치 상에서 마우스 드래그를 차단하고, 최종 변형 데이터(`{ x, y, rotation, scaleX, scaleY }`)를 `asset_manifest.json` 및 `LocalStorage`에 저장.

---

## 3. 🎭 캐릭터 및 파트너 상태 머신 (Character & Partner Systems)

**목표 파일**: `src/ui/widgets/portrait.ts`, `src/engine/suspectState.ts`, `src/dto/suspectDto.ts`

### A. 용의자 파츠 명명 변경 및 상태 전환 (State Parts)
1. **명칭 변경**: `expression` → `stateParts` (상태 파츠)로 스키마 및 DTO 전면 리팩토링.
2. **3가지 용의자 상태**:
   - `base`: 기본 대기 상태.
   - `upset`: 용의자 평정심(Composure)이 지정된 임계값 이하로 감소했을 때 자동 발동하는 분노/동요 이미지.
   - `lose`: 플레이어가 심문 승리 조건(평정심 0 이하/자백)을 달성했을 때 출력되는 굴복/패배 이미지.

### B. 파트너 쿨다운 시스템 (Partner Cooldown)
1. **2가지 상태 (512×512 규격 동일)**:
   - `base`: 능력 사용 가능 활성 상태.
   - `used`: 능력 사용 후 비활성화 쿨다운 상태.
2. **쿨다운 카운트다운 렌더링**:
   - `used` 상태일 때 파트너 초상화 중앙에 남아있는 쿨다운 턴 수(`cooldownTurns`)를 픽셀 폰트로 명확히 표시 및 비활성화 딤(Dimming) 효과 적용.
   - 플레이어 턴 진행 시 `cooldownTurns` 차감, `0`이 되면 자동으로 `base` 상태로 다시 전환되어 능력 재활성화.

---

## 4. 🃏 5계층 카드 레이어링 및 인터랙티브 인터페이스 (Card Engine)

**목표 파일**: `src/ui/widgets/cardFan.ts`, `src/ui/widgets/cardDetailModal.ts`, `src/engine/cardAttachment.ts`

### A. 5계층 Z-Index 카드 파츠 구성
카드는 아래 5개 레이어로 순차적 Z-Index 중첩 렌더링됩니다:
```
[Layer 4] evidence  (증거물 파츠, 128×128, 결합 시 상단 도킹)
[Layer 3] post      (후처리 특수 오버레이 파츠)
[Layer 2] stamp     (인장/도장 파츠)
[Layer 1] illust    (카드 일러스트 파츠, 256×256)
[Layer 0] base      (카드 기본 템플릿, 640×725)
```
- **기본 구성**: `base` (Layer 0) + `illust` (Layer 1).
- **동적 부착**: `stamp`, `post`, `evidence`는 게임 진행 및 증거 결합 이벤트에 따라 실시간으로 추가 부착.

### B. 카드 마우스 호버 & 슬라이드 (Hover Lift & Highlight)
- **기본 상태**: 화면 하단 카드 패널에서 카드 상단 **20%만 보임**.
- **마우스 호버**: 마우스를 올리면 아웃라인이 하이라이트(Cyan/Gold 빛)되며, 카드가 **40% 높이까지 슬라이드 업**.

### C. 카드 전체화면 모달 (Full Screen Focus Modal)
- **클릭 동작**: 호버 중인 카드를 클릭하면 화면 중앙에 **640×725 전체 크기**의 카드 상세 화면 모달 렌더링.
- **모달 해제**: 카드 이외의 배경 영역을 클릭하면 모달이 닫히고 원래 상태(상단 20% 노출)로 복귀.

### D. 태그 드래그 앤 드롭 및 점선 연결 (Drag & Drop Tag Attachment)
- **드래그 연동**: 카드를 드래그하여 태그 칩(Tag Chip) 위에 가져가면:
  - 카드 위치에서 해당 태그 위치까지 **점선(Dotted Line / Stippled Curve)** 가 실시간 렌더링.
  - 해당 태그 칩의 아웃라인이 하이라이트.
- **제출 행동 발동**: 태그 도킹 후 "제출(Submit)" 버튼 클릭 시 카드 효과 및 플레이어 행동이 엔진으로 전달 및 실행.

---

## 5. 🧪 자동화 검증 계획 (Verification & Vitest)

1. **Vitest Unit & Integration Tests**:
   - `tests/ui/assetDimensions.test.ts`: 모든 에셋 규격(1280x800, 512x512, 640x725 등) 검증.
   - `tests/engine/suspectStateParts.test.ts`: `base` → `upset` → `lose` 상태 파츠 전환 조건 검증.
   - `tests/engine/partnerCooldown.test.ts`: 턴 진행에 따른 `used` → `base` (cooldown 0) 전환 검증.
   - `tests/ui/cardLayering.test.ts`: Layer 0~4 레이어 순서 및 20% → 40% → 모달 전체화면 렌더링 검증.
2. **실행 명령**:
   `npx vitest run` 실행하여 100% 통과 확인.

Acknowledge these specifications and reply: "Asset, Character, and Card System Refactoring Specifications Applied Successfully."
```
