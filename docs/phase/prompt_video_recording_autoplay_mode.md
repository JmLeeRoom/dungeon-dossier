# 📑 던전 수사 조서: 2분 30초 15노드 자동 완주 시네마틱 오토플레이(`mode=video`) 최적화 프롬프트

> **[사용 방법]**: 본 프롬프트를 AI 코딩 에이전트에 전달하여, `http://localhost:5174/?autoplay=true&mode=video` 실행 시 15개 노드가 중간 타임아웃 없이 2분 30초(150초) 내에 최종 엔딩 팝업까지 100% 무인 완주되도록 타이밍 및 렌더링 페이싱을 최적화하도록 지시합니다.

```markdown
Role: Lead Game UI/UX & Autoplay Automation Engineer
Task: Fix and Optimize the Cinematic Video Autoplay Mode (`mode=video`) in `src/dev/autoplay/driver.ts` so that all 15 nodes finish smoothly to the final ending screen within 150 seconds (2m 30s) without hitting run timeouts.

---

## 1. 🔍 원인 분석 (Root Cause Analysis)

기존 `video` 모드는 `actionDelayMs: 1800ms`와 긴 타자기 연출(skipTypewriter: false)로 인해 노드당 약 25초 이상 소요되어, 200초(3분 20초) 도달 시점에 8번째 노드에서 타임아웃(`runTimeoutMs: 200_000`)에 걸려 시연이 중단되는 문제가 있었습니다.

---

## 2. ⚙️ 시네마틱 비디오 모드 타이밍 최적화 (`src/dev/autoplay/driver.ts`)

`MODE_CONFIGS.video` 설정을 15개 노드가 150초 내에 안정적으로 완주되도록 다음과 같이 수정하세요:

```typescript
video: {
  timeScale: 1.15,              // 연출 시각성을 유지하며 1.15배속 최적화
  actionDelayMs: 950,           // 카드 호버 및 태그 도킹 대기를 950ms로 조절 (선명한 가독성 보장)
  sceneStallMs: 90_000,
  runTimeoutMs: 360_000,        // 타임아웃 안심 버퍼를 360초(6분)로 확장하여 중간 중단 전면 차단
  skipTypewriter: false,        // 대사 타자기 연출 유지
  targetDurationSec: 150,       // 2분 30초 (150초) 목표 페이싱
}
```

---

## 3. 🎨 타자기 및 노드 전환 페이싱 튜닝

1. **타자기 텍스트 출력 속도 튜닝 (`src/ui/widgets/typewriter.ts`)**:
   - `mode=video`일 때 타자기 글자당 대기 시간(ms)을 약 18~22ms로 조정하여 대사 렌더링 구간 지체 감소.
2. **15노드 완주 자율 주행 프로토콜 (`src/dev/autoplay/driver.ts`)**:
   - 노드 지도 이동 및 승리 팝업 전환 시 15개 노드가 150초에 맞춰 차례대로 슬라이드 진행.
   - 15번째 최종 노드(`enc_ep004_fallen_hero`) 클리어 시 "수사 완료 / 15노드 완주 성공" 엔딩 화면 유지.

---

## 4. 🧪 검증 방법 (Verification)

1. `cmd /c "npx vitest run tests/dev/autoplay-policy.test.ts"`
2. 브라우저에서 `http://localhost:5174/?autoplay=true&mode=video`를 구동하여 15개 노드가 150초에 맞춰 01~15번 노드 완주 엔딩 화면까지 멈춤 없이 100% 진행되는지 확인.

Acknowledge these video mode optimization specifications and reply: "15-Node Video Autoplay Mode Optimized for 150s Scenario Completion."
```
