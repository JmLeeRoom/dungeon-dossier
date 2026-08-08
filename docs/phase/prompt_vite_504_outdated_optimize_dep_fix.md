# 📑 던전 수사 조서: Vite 504 (Outdated Optimize Dep) 에러 원인 분석 & 영구 해결 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 코딩 에이전트에 전달하여 Vite 개발 서버의 504 (Outdated Optimize Dep) 캐시 불일치 오류를 영구 차단하고, `vite.config.ts` 및 자동 재시작 환경을 구축하도록 지시합니다.

```markdown
Role: Senior Frontend Tooling & Vite Infrastructure Specialist
Task: Diagnose and Permanently Fix Vite 504 (Outdated Optimize Dep) Dependency Cache Error in `dungeon-dossier/vite.config.ts`.

---

## 1. 🔍 에러 원인 분석 (Root Cause Analysis)

Vite 개발 서버는 `howler`, `pixi.js`, `zod` 등의 npm 패키지를 `node_modules/.vite/deps/` 경로에 사전 번들링(Pre-bundling)하여 디바운스 최적화를 수행합니다.
`vite.config.ts` 변경이나 종속성 모듈 업데이트 발생 시 Vite는 이전 최적화 해시를 폐기(`Outdated`)하지만, 브라우저 탭이 이전 캐시 해시 URL을 계속 요청하거나 사전 번들링 캐시가 고류 상태일 때 HTTP **504 (Outdated Optimize Dep)** 에러가 발생하여 `howler.js` 등의 스크립트 로드가 차단됩니다.

---

## 2. 🛠️ 해결 방안 (Solutions)

### A. 즉시 해결책 (사용자/개발자 조치)
1. **브라우저 캐시 비우기 및 강제 새로고침**: 브라우저에서 `Ctrl + F5` 또는 `Ctrl + Shift + R` 클릭.
2. **Vite 캐시 재구축 재시행**: `dungeon-dossier` 디렉터리에서 `npx vite --force` 실행.

### B. 코드 레벨 영구 방지책 (`vite.config.ts` 수정)
`dungeon-dossier/vite.config.ts` 파일에 `optimizeDeps` 지정을 명시하여 dependency pre-bundling 해시 파편화를 방지합니다:

```typescript
export default defineConfig({
  base: "./",
  publicDir: false,
  appType: "spa",
  plugins: [
    copyRuntimeData(),
    assertDeveloperConsoleTreeShaken(),
    saveWorkbenchAssetsPlugin(),
  ],
  optimizeDeps: {
    include: ["howler", "pixi.js", "zod"],
    holdUntilCrawlEnd: true,
  },
  server: {
    host: true,
    fs: {
      strict: true,
    },
  },
  // ...
});
```

---

## 3. 🧪 검증 및 합격 기준 (Quality Gates)

1. `dungeon-dossier/` 디렉터리에서 `cmd /c "npx vite --force"` 실행 후 `http://localhost:5174/` 재접속 시 504 에러 0건 확인.
2. `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build` 100% GREEN 검증.

Acknowledge these optimization specifications and reply: "Vite 504 Outdated Optimize Dep Fix Applied Successfully."
```
