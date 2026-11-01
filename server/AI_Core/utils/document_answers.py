"""Bounded, extractive document answers using the request's scoped retrieval only."""
from __future__ import annotations

import re
from typing import Any

_STOP_WORDS = set("the and for from that this with what which where when does have has are was were can could would should about how please tell show file files uploaded attached document documents pdf statement statements review check source sources evidence supporting saved final synthetic test data only".split())
_DOCUMENT_QUESTION = re.compile(r"\b(?:my|this|that|the|attached|uploaded)\b.*\b(?:pdf|file|document|statement|agreement|contract|receipt)\b|\b(?:attached|uploaded)\b", re.I)


def wants_document_lookup(question: str) -> bool:
    query = str(question or "").split("\n\nAttached workspace files:", 1)[0]
    return bool(_DOCUMENT_QUESTION.search(query)
                and re.search(r"\b(?:what|quote|show|find)\b", query, re.I)
                and re.search(r"\b(?:fee|amount|target|progress|deadline|rate|payment|balance|savings)\b", query, re.I))


def _literal_markdown(value: str) -> str:
    # Treat file contents as quoted data, including embedded markdown/HTML.
    return re.sub(r"([\\`*_{}\[\]()<>#!|])", r"\\\1", value)


def document_passage_answer(question: str, finance_context: dict[str, Any] | None) -> str:
    query = str(question or "").split("\n\nAttached workspace files:", 1)[0]
    if not _DOCUMENT_QUESTION.search(query):
        return ""
    if not isinstance(finance_context, dict):
        return ""
    retrieval = finance_context.get("retrieval")
    chunks = retrieval.get("top_chunks") if isinstance(retrieval, dict) else None
    if not isinstance(chunks, list):
        return ""
    terms = {term for term in re.findall(r"\w+", query.lower()) if len(term) >= 3 and term not in _STOP_WORDS}
    passages: list[tuple[int, str, str]] = []
    seen: set[tuple[str, Any, str]] = set()
    for chunk in chunks[:8]:
        if not isinstance(chunk, dict):
            continue
        # The Node boundary is responsible for authenticating/scoping these IDs.
        file_id = chunk.get("workspace_file_id")
        text = chunk.get("text")
        if not isinstance(file_id, str) or not re.fullmatch(r"[a-f\d]{24}", file_id, re.I) or not isinstance(text, str):
            continue
        lines = [line.strip() for line in text[:2400].splitlines() if line.strip()]
        scored = [(len(terms.intersection(re.findall(r"\w+", line.lower()))), index, line) for index, line in enumerate(lines)]
        matching = sorted((entry for entry in scored if entry[0] > 0), key=lambda entry: (-entry[0], entry[1]))[:2]
        if not matching:
            continue
        # Keep the original wording/order; never infer amounts or missing clauses.
        excerpt = "\n".join(entry[2] for entry in sorted(matching, key=lambda entry: entry[1]))[:800]
        page = chunk.get("page_number")
        page = page if isinstance(page, int) and not isinstance(page, bool) and 0 < page <= 9_007_199_254_740_991 else None
        key = (file_id, page, excerpt)
        if key in seen:
            continue
        seen.add(key)
        name = str(chunk.get("file_name") or "Uploaded document").replace("\n", " ")[:160]
        label = _literal_markdown(name) + (f" · page {page}" if page else "")
        quote = "\n".join("> " + _literal_markdown(line) for line in excerpt.splitlines())
        passages.append((sum(entry[0] for entry in matching), label, quote))
    if not passages:
        return "I couldn't find a matching passage in the available extracted text. Open the original file or ask about a specific phrase; scanned or omitted pages may need further extraction."
    passages.sort(key=lambda item: -item[0])
    return "## From your files\n\nQuoted passages from the available extracted text. Open a source to review the full context.\n\n" + "\n\n".join(
        f"**{label}**\n\n{quote}" for _, label, quote in passages[:2]
    )
