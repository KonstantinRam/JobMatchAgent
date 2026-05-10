# Workflow Diagrams

## Step 1: Data Collection.

```mermaid
flowchart TB
  S_chat_LLM[Chatbot LLM]
  D_profile_data[(UserProfile Blackboard)]
  S_job_provide_raw["Raw Job Provider (text, pdf, image...)"]
  S_job_extractor_LLM[Job Extractor LLM]
  D_job_data[(Job Blackboard)]
  D_Canon_dictionary[(Canon Dictionary)]
  T_normalizer[[Normalizer Tool]]

  S_chat_LLM --> D_profile_data
  S_job_provide_raw --> S_job_extractor_LLM --> D_job_data

  S_chat_LLM -.uses.-> T_normalizer
  S_job_extractor_LLM -.uses.-> T_normalizer
  T_normalizer -.reads.-> D_Canon_dictionary
```

## Step 2: Matching.

Both blackboards hold two kinds of fields: **tokenized** (normalized, deterministic) and **soft** (semantic, qualitative). They flow down two parallel paths and merge in a single Match Report.

```mermaid
flowchart TB
  D_profile_data[(UserProfile Blackboard)]
  D_job_data[(Job Blackboard)]

  S_multicriteria[["Multi-Criteria Scorer<br/>(deterministic)"]]
  S_semantic_LLM[LLM Semantic Matcher]

  D_Report[(Match Report)]

  D_profile_data -- tokenized --> S_multicriteria
  D_job_data -- tokenized --> S_multicriteria

  D_profile_data -- soft --> S_semantic_LLM
  D_job_data -- soft --> S_semantic_LLM

  S_multicriteria -- "main score N/100<br/>+ hard criteria checks => verdict" --> D_Report
  S_semantic_LLM -- "soft criteria checks<br/>(verdict + description)" --> D_Report
```

## Step 3: Triage (career advisor).
```mermaid
flowchart TB
  D_Report[(Match Report)]
  S_triage_LLM["Triage LLM<br/>(career advisor)"]
  D_advice["Career Advice<br/>fit narrative, skill gaps, profile gaps"]

  D_Report --> S_triage_LLM
  S_triage_LLM --> D_advice
```
