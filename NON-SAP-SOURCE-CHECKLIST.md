# Non-SAP-source → Mendix 컨버전 체크리스트

> 대상: `sources/Non-SAP-source/`
> 참고: `README.md`의 0~6단계 파이프라인 + `skills/migration-pipeline.md`
> 이 문서는 **진행 순서·스킬·프롬프트 템플릿만** 다룬다 — 소스의 기술스택/화면/데이터 등 실제 내용은 여기 적지 않는다(해당 내용은 `analysis/Non-SAP-source/`에 별도로 정리).
> 프롬프트 규칙: 각 프롬프트 첫 줄의 `먼저 읽기:`가 그 단계의 스킬 경로다 — 프롬프트는 이 줄을 포함해 통째로 복사해서 실행한다.

---

## 진행 전 자체 점검

- [ ] `sources/Non-SAP-source/`가 완전한 앱인지 발췌본인지 확인했다
- [ ] 기존 추출 파이프라인(`pipelines/outsystems/`, `pipelines/java-angular/`)이 이 소스 스택을 커버하는지, 혹은 새 extractor 구축이 필요한지 아직 미정임을 인지했다 (extractor는 앱 크기와 무관하게 항상 세운다)
- [ ] `analysis/`, `sources/`, `knowledge-base/`는 저장소 `.gitignore`에 포함되어 커밋 위험이 없음을 확인했다

---

## 0단계 — TRIAGE (선별)

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/source-triage.md, skills/assess-migration.md

  sources/Non-SAP-source/ 전체를 검토해줘. 기존 추출 파이프라인이 이 소스 스택을
  커버하는지 판단하고, 재사용할지 새 extractor를 구축할지 결정해줘 (extractor는
  앱 크기와 무관하게 항상 세운다). analysis/Non-SAP-source/architecture.md에
  커버리지 매트릭스 + 파이프라인 결정(재사용/신규 구축) + 확정 범위를 정리해줘.
  ```

- [ ] 산출물 확인: `analysis/Non-SAP-source/architecture.md`에 커버리지 매트릭스 · 파이프라인 결정(재사용/신규 구축) · 확정 범위가 명시되어 있는가
- [ ] **게이트: 이 판정이 나기 전에는 2단계(REQUIREMENTS)로 넘어가지 않는다**

---

## 1단계 — ANALYSIS (분석)

두 경로는 순서 무관하게 진행 가능하며, 같은 병합 단계로 합류한다.

### Path A — 코드 → 구조

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/assess-migration.md (0단계와 같은 세션이면 생략 가능)

  analysis/Non-SAP-source/architecture.md의 확정 범위에 따라 sources/Non-SAP-source/의
  해당 소스 파일들을 분석해서 엔티티 후보, 비즈니스 로직, 화면 구조를 같은
  architecture.md에 구조화된 섹션으로 추가해줘.
  ```

- [ ] 산출물 확인: `architecture.md`에 엔티티 후보 / 로직 목록 / 화면 구조 섹션이 추가됨

### Path B — 문서/데이터 → KB

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/kb-generation.md

  위 스킬의 템플릿에 따라 sources/Non-SAP-source/의 문서·데이터 자료를 분석해서
  analysis/Non-SAP-source/knowledge-base/share/ 밑에 KB 마크다운을 작성해줘.
  필드 정의, 대표 샘플, 화면 구성요소를 포함해.
  ```

- [ ] 산출물 확인: `analysis/Non-SAP-source/knowledge-base/share/`에 KB 마크다운 생성됨

---

## 2단계 — REQUIREMENTS (요구사항 / BRD)

- [ ] BRD 작성 프롬프트 실행

  ```
  먼저 읽기: skills/brd-generation.md

  위 스킬의 프롬프트 템플릿에 따라 analysis/Non-SAP-source/architecture.md와
  knowledge-base/share/ 산출물을 합쳐서 BRD JSON을
  analysis/Non-SAP-source/knowledge-base/brd/ 밑에 작성해줘. 소스 전용 구문이나
  마이그레이션 대상 프레임워크에 없는 기능은 businessRules 또는 openQuestions로
  명시해줘.
  ```

- [ ] 검증 프롬프트 실행

  ```
  먼저 읽기: skills/brd-validation.md

  위 스킬의 체크리스트로 방금 작성한 BRD JSON을 검증해줘.
  중복/충돌/고아 개념/깨진 관계를 찾아서 고치고, clean 상태가 될 때까지 반복해줘.
  ```

- [ ] 산출물 확인: `analysis/Non-SAP-source/knowledge-base/brd/*.brd.json`이 validation-clean 상태

---

## 3단계 — ARCHITECTURE & DESIGN (병렬 진행)

### 3a — 모듈 경계 (선행)

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/modularize-domain.md

  위 스킬의 기준에 따라 방금 검증된 BRD가 별도 Mendix 모듈이어야 하는지,
  기존 앱의 한 모듈로 흡수돼야 하는지 판단하고 근거 HTML 문서를 만들어줘.
  소스 파일 구조를 그대로 베끼지 말고 결정해줘.
  ```

- [ ] 산출물 확인: 모듈 경계 결정 + 근거 HTML, 사용자 승인 완료

### 3b — 아키텍처 청사진 (3a 완료 후, 3c와 병행 가능)

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/architecture-blueprint.md

  위 스킬에 따라 모듈 정의 문서, 구조 다이어그램, fit-gap 분석을 작성해줘.
  대상 프레임워크가 제공하지 않는 소스 의존 기능은 fit-gap 항목으로 명시해줘.
  ```

- [ ] 산출물 확인: 모듈 정의 + 다이어그램 + fit-gap(오픈 이슈 포함) 문서

### 3c — 디자인 산출물 (3a 완료 후, 3b와 병행 가능)

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/design-artifacts.md

  위 스킬에 따라 sources/Non-SAP-source/의 참고 화면 자료를 바탕으로
  Mendix Atlas 기반 와이어프레임을 작성해줘.
  ```

- [ ] 산출물 확인: 버전 관리된 디자인 시스템 + 화면별 와이어프레임

---

## 4단계 — BUILD PLAN (빌드 계획)

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/brd-to-build-plan.md

  위 스킬에 따라 BRD + 3단계 아키텍처 산출물을 바탕으로 번호 매겨진
  의존성 순서 빌드 계획(엔티티→연관관계→마이크로플로우→페이지)을 작성해줘.
  ```

- [ ] 산출물 확인: 의존성 순서로 번호 매겨진 스크립트 계획 문서
- [ ] 빌드 계획은 이 저장소가 아니라 대상 Mendix 프로젝트 쪽 저장소에 둔다

---

## 5단계 — BUILD (빌드)

> ⚠️ 실제 Mendix `.mpr` 프로젝트가 열려 있어야 시작 가능 — 이 툴킷 저장소에는 대상 앱이 없으므로, mxcli로 여는 별도 Mendix 프로젝트 폴더에서 진행한다.

- [ ] 대상 Mendix 프로젝트(.mpr) 준비 및 Studio Pro 실행 확인
- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/iterative-build-loop.md, skills/mdl-cookbook-microflows.md,
  skills/learned-microflow-patterns.md, skills/learned-page-patterns.md

  빌드 계획의 1번 스크립트부터 iterative-build-loop의 게이트에 따라 mxcli로
  실행하고 검증해줘. MDL 작성 시 cookbook과 learned 패턴 규칙을 따라줘.
  ```

- [ ] 계획의 각 스크립트를 모듈/화면 단위로 반복하며 게이트 통과 확인
- [ ] CE 오류 발생 시 `bug-logs/mxcli-bugs.md` 대조 후 알려진 이슈인지 확인
- [ ] 스크린샷/UI 검증 전 README의 "오래된 빌드 금지" 프로토콜(SP 재시작 → Run Locally → 200 확인) 준수

---

## 6단계 — TEST (테스트)

- [ ] 프롬프트 실행

  ```
  먼저 읽기: skills/e2e-harness-base.md, skills/learned-db-assertions.md

  골든 패스(조회/등록/수정/삭제) Playwright 테스트를 작성하고, 원본 데이터 샘플을
  시드로 써줘. DB 검증은 learned-db-assertions대로 진행해줘.
  ```

- [ ] 골든 패스 통과 확인
- [ ] 엣지 케이스(빈 값, 중복 키, 페이징 경계 등) 통과 확인
- [ ] DB 어설션 통과 확인

---

## 진행 중 계속 열어둘 참고 문서

- [ ] `sources/Non-SAP-source/` 하위의 전제조건/제약 문서 (있는 경우)
- [ ] `process/process-learnings.md` — 과거 유사 프로젝트의 프로세스 결정 참고
- [ ] `README.md` — 단계 간 관계, `assess-migration.md`와 추출 파이프라인의 보완 관계
