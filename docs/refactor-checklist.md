# Refactor Checklist

이 문서는 프로젝트 구조 개선 작업을 추적하기 위한 체크리스트다.
앞으로 리팩터링 작업을 시작할 때마다 먼저 이 파일을 확인하고, 완료 시 체크를 갱신한다.

## How To Use

- [ ] 새 리팩터링 작업을 시작하기 전에 이 문서를 먼저 읽기
- [ ] 작업 범위가 체크리스트의 어느 단계 / 세부 단계에 해당하는지 먼저 정하기
- [ ] 구현 전에 해당 세부 단계의 계획을 더 잘게 쪼개기
- [ ] 구현 후에는 검증 항목까지 실제로 확인하고 체크 갱신하기
- [ ] 새로운 리팩터링 원칙이나 후속 작업이 생기면 이 문서에 즉시 반영하기

## Current Focus

- [x] 현재 우선순위: `1단계 > 1-1. output path / preflight 분리`
- [x] 현재 우선순위: `1단계 > 1-2. 워터마크 자산 생성 분리`
- [x] 현재 우선순위: `1단계 > 1-3. PDF export / image export 분리`
- [x] 현재 우선순위: `1단계 > 1-4. IPC orchestration만 남기기`
- [x] 현재 우선순위: `2단계 > 2-1. preview state hook 분리`
- [x] 현재 우선순위: `2단계 > 2-2. processing submission hook 분리`
- [ ] 다음 우선순위: `2단계 > 2-3. App는 조합만 하도록 정리`

## Done Criteria

- [ ] 해당 단계의 체크박스가 모두 완료됨
- [x] `npm run typecheck` 통과
- [x] `npm test` 통과
- [x] `npm run build` 통과
- [ ] 관련 수동 검증까지 끝남
- [ ] 필요하면 이 문서의 다음 우선순위 갱신

## 전체 로드맵

- [ ] 1단계: `electron/main.ts` 책임 분리
- [ ] 2단계: `App.tsx`의 preview / processing state 분리
- [ ] 3단계: 컴포넌트 props / 인터페이스 정리
- [ ] 4단계: shared 계산 계층 정리
- [ ] 5단계: 아키텍처 / 설계 의도 문서화

## 1단계: `electron/main.ts` 책임 분리

목표: `electron/main.ts`에 SRP / SoC / DRY 적용

### 1-1. output path / preflight 분리

- [x] `resolveOutputPath` / `collectPlannedOutputs` / 충돌 검사 흐름 연결 구조 확인
- [x] `electron/main.ts`에서 경로 계산 / 충돌 관련 코드를 별도 모듈로 이동
- [x] 메인 프로세스는 검사 요청 orchestration만 담당하게 정리
- [x] 관련 타입을 shared 또는 electron 전용 모듈로 정리
- [x] 기존 테스트 통과 확인

후보 파일:
- [x] `/Users/fd2/dev/pdf-watermark/electron/outputPlanning.ts`

### 1-2. 워터마크 자산 생성 분리

- [x] 출력용 워터마크 자산 생성 코드 추출
- [x] opacity 적용 경로 정리
- [x] image export용 자산 생성과 PDF export용 자산 경로 분리
- [x] oversample / padding / fit 정책을 한 곳에 모으기
- [x] 호출부는 필요한 자산만 요청하게 정리

후보 파일:
- [x] `/Users/fd2/dev/pdf-watermark/electron/watermarkAssets.ts`

### 1-3. PDF export / image export 분리

- [x] PDF 처리 함수를 별도 모듈로 분리
- [x] image 처리 함수를 별도 모듈로 분리
- [x] `main.ts`는 파일 종류 분기 + orchestration만 담당하게 정리
- [ ] PDF / image preview parity 수동 확인

후보 파일:
- [x] `/Users/fd2/dev/pdf-watermark/electron/processPdfFile.ts`
- [x] `/Users/fd2/dev/pdf-watermark/electron/processImageFile.ts`

### 1-4. IPC orchestration만 남기기

- [x] `ipcMain.handle(...)` 내부 로직 최소화
- [x] 입력 검증
- [x] process 요청 orchestration
- [x] 오류 포맷팅
- [x] 결과 반환만 담당하게 정리

### 1-5. 검증

- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [ ] PDF export 수동 확인
- [ ] PNG export 수동 확인
- [ ] conflict confirm 수동 확인

## 2단계: `App.tsx` preview / processing state 분리

목표: `App.tsx`에서 preview / processing 관련 책임 분리

### 2-1. preview state hook 분리

- [x] selected preview file 계산
- [x] preview payload 로딩
- [x] object URL 관리
- [x] PDF document / page preview 상태
- [x] preview coordinate / display size 관리
- [x] watermark preview URL / natural size 관리

후보 파일:
- [x] `/Users/fd2/dev/pdf-watermark/src/hooks/usePreviewState.ts`

### 2-2. processing submission hook 분리

- [x] 시작 전 입력 검증
- [x] preflight conflict confirm
- [x] `isProcessing`, `statusMessage`, `lastResult` 분리
- [x] `window.watermarkApi.processFiles(...)` orchestration 분리

후보 파일:
- [x] `/Users/fd2/dev/pdf-watermark/src/hooks/useProcessingState.ts`

### 2-3. App는 조합만 하도록 정리

- [x] editable state history hook 분리
- [x] output summary 계산 분리
- [x] file selection actions hook 분리
- [x] output settings actions hook 분리
- [ ] App는 hook 조합과 레이아웃만 담당
- [ ] panel / preview props 연결 정리

### 2-4. 검증

- [ ] preview 로딩 회귀 없음
- [ ] processing / export 회귀 없음
- [ ] direct manipulation 회귀 없음

## 3단계: 컴포넌트 props / 인터페이스 정리

목표: props 계약 단순화 및 ISP 적용

### 3-1. `WatermarkPanel` props 정리

- [ ] numeric control handlers 묶기
- [ ] size control handlers 묶기
- [ ] flat prop 과다 여부 정리

### 3-2. `PreviewPane` props 정리

- [ ] pager 관련 props 묶기
- [ ] overlay / interaction props 묶기
- [ ] preview asset props 묶기

### 3-3. 타입 이름 정리

- [ ] UI props 타입을 컴포넌트 옆에 유지
- [ ] shared 타입과 component props 타입 구분

## 4단계: shared 계산 계층 정리

목표: sizing / geometry / snap / interaction helper 경계 정리

### 4-1. sizing / geometry / snap 경계 재정리

- [ ] `watermarkSizing.ts` 책임 점검
- [ ] `watermarkGeometry.ts` 책임 점검
- [ ] `watermarkSnap.ts` 책임 점검
- [ ] 경계가 애매한 함수 재배치

### 4-2. interaction helper 경계 정리

- [ ] keyboard helper 정리
- [ ] resize helper 정리
- [ ] rotation helper 정리
- [ ] helper 책임 범위 점검

### 4-3. 테스트 보강

- [ ] preset + free size 공존 규칙
- [ ] aspect-ratio toggle 규칙
- [ ] rotated resize / modifier 조합
- [ ] snap / normalize 규칙

## 5단계: 아키텍처 / 설계 의도 문서화

목표: 구조와 리팩터링 원칙을 짧게 문서화

### 5-1. architecture note

- [ ] renderer state 구조
- [ ] interaction hook 구조
- [ ] export pipeline 구조
- [ ] preview / export parity 원칙

후보 위치:
- [ ] `/Users/fd2/dev/pdf-watermark/README.md`
- [ ] `/Users/fd2/dev/pdf-watermark/docs/architecture.md`

### 5-2. 리팩터링 규칙 문서화

- [ ] SRP: 어디까지가 한 책임인지
- [ ] shared helper를 언제 만드는지
- [ ] direct manipulation state 추가 규칙

## 적용 원칙 체크리스트

- [ ] SRP: 모듈이 한 이유로만 바뀌는가
- [ ] OCP: PDF / image / export 규칙 확장 시 기존 코드 수정 범위가 작나
- [ ] ISP: props / interface가 과하게 크지 않은가
- [ ] DIP: 상위 흐름이 `sharp`, `pdf-lib` 세부 구현에 과하게 묶이지 않는가
- [ ] DRY: preview / export / path planning / resize 규칙 중복이 없는가
- [ ] KISS: 과한 패턴 없이 함수 / 훅 / 모듈 단위로 단순한가
- [ ] YAGNI: 아직 안 쓸 일반화를 미리 넣지 않았는가

## 추천 실제 진행 순서

- [ ] `electron/main.ts`에서 output path / preflight 분리
- [ ] `electron/main.ts`에서 watermark asset build 분리
- [ ] `electron/main.ts`에서 PDF / image processor 분리
- [x] `App.tsx`에서 preview state hook 분리
- [x] `App.tsx`에서 processing state hook 분리
- [ ] `WatermarkPanel` / `PreviewPane` props 정리
- [ ] shared / helper 경계 정리
- [ ] architecture note 작성
