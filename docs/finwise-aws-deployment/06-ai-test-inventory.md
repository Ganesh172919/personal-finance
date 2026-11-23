# Ai Test Inventory

Static source index, generated from the release worktree on 23 November 2026. Declarations are not test results.

## `server/AI_Core/tests/learning_loop/test_learning_api.py`

- Line 39: `def test_requires_internal_token_and_actor_headers(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:39`

- Line 59: `def test_admin_routes_reject_non_admin(client, method, path):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:59`

- Line 68: `def test_feedback_is_accepted_and_stored_for_the_header_org(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:68`

- Line 78: `def test_feedback_opt_out_header_stores_nothing(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:78`

- Line 89: `def test_feedback_validates_the_payload(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:89`

- Line 100: `def test_list_and_get_artifacts_are_camel_case_and_org_scoped(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:100`

- Line 115: `def test_promote_flow_draft_to_canary_to_active_then_rollback(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:115`

- Line 126: `def test_promote_in_suggest_mode_is_409(client, monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:126`

- Line 134: `def test_promote_is_blocked_when_the_gate_has_not_passed(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:134`

- Line 144: `def test_actor_user_must_match_the_header_user(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:144`

- Line 152: `def test_other_orgs_artifacts_are_404_for_promote_and_rollback(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:152`

- Line 160: `def test_global_artifacts_need_a_platform_org(client, monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:160`

- Line 168: `def test_rolling_back_a_draft_is_a_409(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:168`

- Line 177: `def test_optimize_run_returns_a_job_id_and_status_reports_the_result(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:177`

- Line 196: `def test_optimize_run_global_scope_requires_platform_org(client, monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:196`

- Line 204: `def test_reports_are_org_scoped_and_limit_is_honoured(client):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_api.py:204`

## `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py`

- Line 17: `def test_wilson_lower_bound_basics():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:17`

- Line 24: `def test_gate_passes_a_harmless_style_edit_and_persists_the_report():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:24`

- Line 36: `def test_gate_blocks_a_candidate_that_degrades_number_safety():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:36`

- Line 57: `def test_compare_number_safety_has_zero_tolerance():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:57`

- Line 76: `def test_gate_runs_a_routing_candidate_and_rejects_regressions():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:76`

- Line 87: `def test_gate_replay_reads_only_the_artifacts_own_org():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:87`

- Line 108: `def test_suggest_mode_blocks_promotion(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:108`

- Line 118: `def test_unknown_mode_falls_back_to_human(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:118`

- Line 127: `def test_human_mode_promote_draft_starts_canary_then_active_and_retires_previous():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:127`

- Line 143: `def test_human_mode_never_self_promotes(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:143`

- Line 149: `def test_canary_advances_5_25_100_then_waits_for_admin_in_human_mode():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:149`

- Line 167: `def test_canary_waits_below_min_samples():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:167`

- Line 174: `def test_auto_prompts_promotes_a_clean_prompt_but_never_a_routing_candidate(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:174`

- Line 210: `def test_each_guardrail_breach_auto_rolls_back_and_audits(traffic, breach):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:210`

- Line 226: `def test_rollback_after_promotion_restores_previous_active():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:226`

- Line 243: `def test_fast_guard_after_thumbs_down_rolls_back_without_waiting_for_tick():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:243`

- Line 252: `def test_sticky_canary_assignment_does_not_change_between_steps():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:252`

- Line 262: `def test_shadow_is_off_by_default(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:262`

- Line 270: `def test_global_artifacts_require_a_platform_org(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_gate_rollout.py:270`

## `server/AI_Core/tests/learning_loop/test_learning_journey.py`

- Line 10: `def test_feedback_candidate_gate_regression_rollback_and_admin_recovery():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_journey.py:10`

## `server/AI_Core/tests/learning_loop/test_learning_optimizer.py`

- Line 34: `def test_budget_zero_makes_no_llm_calls_and_still_produces_a_candidate():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:34`

- Line 48: `def test_budget_default_is_zero(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:48`

- Line 55: `def test_llm_rephrase_is_used_only_when_clean_and_within_budget():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:55`

- Line 65: `def test_llm_output_with_digits_falls_back_to_the_heuristic():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:65`

- Line 75: `def test_wrong_number_feedback_never_edits_a_prompt():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:75`

- Line 82: `def test_below_min_feedback_produces_no_candidates():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:82`

- Line 87: `def test_org_opt_out_skips_the_optimizer(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:87`

- Line 94: `def test_org_scope_requires_an_org_id():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:94`

- Line 104: `def test_org_b_optimizer_never_reads_org_a_runs(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:104`

- Line 123: `def test_org_b_candidates_are_scoped_to_org_b_only():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:123`

- Line 138: `def test_global_scope_needs_k_anonymity_and_carries_no_user_text(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:138`

- Line 163: `def test_job_lifecycle_and_last_run():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:163`

- Line 183: `def test_bandit_flag_off_keeps_caller_order():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:183`

- Line 189: `def test_bandit_result_is_always_a_permutation_and_respects_health(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:189`

- Line 197: `def test_bandit_prefers_rewarded_arm_and_demotes_below_quality_floor(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:197`

- Line 210: `def test_bandit_force_flag_and_single_model_passthrough():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:210`

- Line 229: `def test_consolidation_demotes_duplicates(mem):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:229`

- Line 240: `def test_consolidation_decays_stale_inferred_memories(mem):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:240`

- Line 252: `def test_consolidation_demotes_contradicted_memory(mem):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:252`

- Line 260: `def test_consolidation_dry_run_and_isolation(mem):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_optimizer.py:260`

## `server/AI_Core/tests/learning_loop/test_learning_registry.py`

- Line 31: `def test_default_prompts_are_byte_identical_and_served_when_registry_empty():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:31`

- Line 40: `def test_routing_defaults_reproduce_pre_registry_thresholds():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:40`

- Line 56: `def test_routing_config_is_bounded(field, value):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:56`

- Line 61: `def test_lint_rejects_unsafe_prompts_and_accepts_style_edits():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:61`

- Line 74: `def test_exemplars_must_be_digit_free_and_known_slot():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:74`

- Line 93: `def test_store_create_versions_audit_and_lint_gate():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:93`

- Line 106: `def test_store_transitions_are_enforced():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:106`

- Line 117: `def test_api_json_is_camel_case():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:117`

- Line 124: `def test_loader_precedence_org_canary_over_org_active_over_global():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:124`

- Line 142: `def test_canary_bucket_is_sticky_monotonic_and_roughly_proportional():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:142`

- Line 158: `def test_canary_resolution_is_sticky_per_user():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:158`

- Line 174: `def test_use_defaults_and_use_artifacts_overrides():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:174`

- Line 183: `def test_context_records_served_versions():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:183`

- Line 193: `def test_redaction_masks_amounts_emails_phones_accounts():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_registry.py:193`

## `server/AI_Core/tests/learning_loop/test_learning_runstore.py`

- Line 14: `def test_capture_stores_redacted_text_and_metadata():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:14`

- Line 29: `def test_opt_out_header_flag_and_org_setting_skip_capture(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:29`

- Line 39: `def test_feedback_links_run_versions_and_sanitises_correction():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:39`

- Line 47: `def test_feedback_validates_rating_and_org():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:47`

- Line 56: `def test_org_filter_cannot_be_overridden_and_orgs_are_isolated():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:56`

- Line 69: `def test_aggregates_split_candidate_and_baseline():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:69`

- Line 81: `def test_global_signals_are_k_anonymous_numeric_and_respect_opt_out(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:81`

- Line 103: `def test_ttl_index_is_created(monkeypatch):`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:103`

- Line 111: `def test_async_writer_is_bounded_and_never_blocks():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:111`

- Line 131: `def test_async_writer_flushes_to_mongo():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:131`

- Line 140: `def test_default_writer_is_synchronous_without_real_mongo():`
  - Source: `server/AI_Core/tests/learning_loop/test_learning_runstore.py:140`

## `server/AI_Core/tests/test_activity_review.py`

- Line 19: `def test_names_saved_records_ranks_overdue_tasks_and_preserves_cents():`
  - Source: `server/AI_Core/tests/test_activity_review.py:19`

- Line 29: `def test_does_not_guess_progress_or_turn_record_markup_into_links():`
  - Source: `server/AI_Core/tests/test_activity_review.py:29`

- Line 39: `def test_leaves_unrelated_requests_and_document_questions_to_the_existing_workflow(question):`
  - Source: `server/AI_Core/tests/test_activity_review.py:39`

- Line 43: `def test_empty_or_malformed_context_is_not_invented():`
  - Source: `server/AI_Core/tests/test_activity_review.py:43`

- Line 51: `def test_activity_review_skips_graph_fanout_and_model_calls(monkeypatch, question):`
  - Source: `server/AI_Core/tests/test_activity_review.py:51`

- Line 66: `def test_http_and_sse_use_the_same_current_activity_snapshot(stream, question):`
  - Source: `server/AI_Core/tests/test_activity_review.py:66`

- Line 88: `def test_one_step_names_only_the_first_owned_task_and_does_not_generate_a_plan():`
  - Source: `server/AI_Core/tests/test_activity_review.py:88`

## `server/AI_Core/tests/test_agent_currency.py`

- Line 21: `def test_synthesis_and_insights_use_request_currency_without_cross_request_state(agent_class):`
  - Source: `server/AI_Core/tests/test_agent_currency.py:21`

- Line 37: `def test_specialist_narratives_and_strategy_rationale_use_profile_currency(currency, symbol):`
  - Source: `server/AI_Core/tests/test_agent_currency.py:37`

- Line 50: `def test_currency_default_is_consistent_across_insights_and_plan(currency):`
  - Source: `server/AI_Core/tests/test_agent_currency.py:50`

## `server/AI_Core/tests/test_agent_efficiency.py`

- Line 46: `def test_complex_request_runs_two_specialists_and_only_one_optional_rewrite(workflow, narrative, expected_calls):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:46`

- Line 65: `def test_shallow_multi_domain_request_does_not_fan_out_to_all_four_agents(workflow):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:65`

- Line 74: `def test_full_financial_review_keeps_all_applicable_specialists(workflow):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:74`

- Line 89: `def test_explicit_questions_override_old_investment_context(query, expected):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:89`

- Line 97: `def test_ambiguous_followups_inherit_latest_user_domain(query):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:97`

- Line 104: `def test_word_boundaries_prevent_accidental_domains():`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:104`

- Line 108: `def test_planner_is_lazy_and_does_not_add_duplicate_or_unrequested_work(monkeypatch):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:108`

- Line 117: `def test_invalid_opt_in_llm_plan_falls_back_without_duplicate_work():`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:117`

- Line 125: `def test_opt_in_plan_deduplicates_agents_and_rejects_dependency_cycles():`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:125`

- Line 134: `def test_node_retry_executes_the_handler_again_before_advancing(workflow):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:134`

- Line 150: `def test_node_stops_after_retry_budget(workflow):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:150`

- Line 162: `def test_failed_workflow_keeps_retry_traces_without_running_synthesis(workflow, monkeypatch):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:162`

- Line 177: `def test_missing_profile_does_not_launch_a_personalized_multi_agent_pipeline(workflow, monkeypatch):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:177`

- Line 194: `def test_risk_verification_reads_current_and_legacy_specialist_allocations(workflow, allocation_key):`
  - Source: `server/AI_Core/tests/test_agent_efficiency.py:194`

## `server/AI_Core/tests/test_agent_metrics.py`

- Line 24: `def test_parallel_workers_preserve_request_context_and_report_their_actual_work_duration():`
  - Source: `server/AI_Core/tests/test_agent_metrics.py:24`

- Line 52: `def test_concurrent_requests_keep_usage_isolated():`
  - Source: `server/AI_Core/tests/test_agent_metrics.py:52`

- Line 75: `def test_nested_measurements_do_not_double_count_usage_and_capture_cache_hits():`
  - Source: `server/AI_Core/tests/test_agent_metrics.py:75`

- Line 94: `def test_cache_values_cannot_be_mutated_by_another_agent():`
  - Source: `server/AI_Core/tests/test_agent_metrics.py:94`

- Line 104: `def test_cache_expiry_uses_monotonic_time(monkeypatch):`
  - Source: `server/AI_Core/tests/test_agent_metrics.py:104`

- Line 116: `def test_cache_rejects_invalid_capacity_and_ttl(size, ttl):`
  - Source: `server/AI_Core/tests/test_agent_metrics.py:116`

## `server/AI_Core/tests/test_canary_validator.py`

- Line 32: `def test_verify_number_subset_clean_and_permissive():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:32`

- Line 43: `def test_verify_number_subset_catches_hallucinations():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:43`

- Line 53: `def test_verify_zero_sum_reallocation_valid():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:53`

- Line 62: `def test_verify_zero_sum_reallocation_pool_leak():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:62`

- Line 71: `def test_verify_zero_sum_reallocation_negative_allocation():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:71`

- Line 79: `def test_verify_balance_sheet_valid_and_invalid():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:79`

- Line 92: `def test_verify_cashflow_valid_and_invalid():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:92`

- Line 104: `def test_verify_debt_amortization_valid_and_invalid():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:104`

- Line 121: `def test_synthetic_canary_probe_suite_execution():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:121`

- Line 130: `def test_production_canary_engine_health_and_telemetry():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:130`

- Line 151: `def test_aggregator_live_canary_recording():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:151`

- Line 172: `def test_api_service_canary_endpoints():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:172`

- Line 225: `def test_api_service_status_includes_canary():`
  - Source: `server/AI_Core/tests/test_canary_validator.py:225`

## `server/AI_Core/tests/test_concurrency.py`

- Line 10: `def test_gate_sheds_when_full_and_recovers():`
  - Source: `server/AI_Core/tests/test_concurrency.py:10`

- Line 24: `def test_release_never_goes_negative():`
  - Source: `server/AI_Core/tests/test_concurrency.py:24`

- Line 30: `def test_run_offloads_and_releases_on_error():`
  - Source: `server/AI_Core/tests/test_concurrency.py:30`

- Line 43: `def test_event_loop_stays_responsive_during_blocking_work():`
  - Source: `server/AI_Core/tests/test_concurrency.py:43`

- Line 61: `def test_slot_context_manager_releases():`
  - Source: `server/AI_Core/tests/test_concurrency.py:61`

## `server/AI_Core/tests/test_conversation_summarizer.py`

- Line 21: `def test_factual_summary_counts_real_titles_and_links_only_supplied_sessions():`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:21`

- Line 30: `def test_invalid_rows_and_saved_markup_do_not_become_source_links():`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:30`

- Line 41: `def test_bounds_input_and_does_not_call_a_model_for_empty_or_non_narrative_context(monkeypatch):`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:41`

- Line 53: `def test_rejects_generic_plans_invented_figures_and_unverified_links(monkeypatch, candidate):`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:53`

- Line 65: `def test_one_synthesis_invocation_preserves_provider_text_blocks(monkeypatch):`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:65`

- Line 78: `def test_explicit_summary_task_skips_financial_specialist_fanout(monkeypatch):`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:78`

- Line 90: `def test_http_and_sse_return_summary_sections_without_financial_actions(stream):`
  - Source: `server/AI_Core/tests/test_conversation_summarizer.py:90`

## `server/AI_Core/tests/test_data_processor.py`

- Line 4: `def test_categorize_transactions_prefers_explicit_type():`
  - Source: `server/AI_Core/tests/test_data_processor.py:4`

## `server/AI_Core/tests/test_document_answers.py`

- Line 12: `def test_exact_document_lookup_does_not_run_unrelated_financial_specialists(monkeypatch):`
  - Source: `server/AI_Core/tests/test_document_answers.py:12`

- Line 24: `def test_explicit_document_metrics_do_not_fan_out_or_substitute_profile_facts(metric, monkeypatch):`
  - Source: `server/AI_Core/tests/test_document_answers.py:24`

- Line 47: `def test_quotes_the_relevant_clause_with_physical_page_and_original_amount():`
  - Source: `server/AI_Core/tests/test_document_answers.py:47`

- Line 55: `def test_does_not_let_the_attached_document_choose_the_question():`
  - Source: `server/AI_Core/tests/test_document_answers.py:55`

- Line 60: `def test_missing_and_unmatched_extraction_does_not_invent_a_fee():`
  - Source: `server/AI_Core/tests/test_document_answers.py:60`

- Line 67: `def test_quotes_are_bounded_deduplicated_and_markdown_escaped():`
  - Source: `server/AI_Core/tests/test_document_answers.py:67`

- Line 77: `def test_unverified_page_values_are_not_added_to_the_quote_label(page):`
  - Source: `server/AI_Core/tests/test_document_answers.py:77`

- Line 84: `def test_http_and_sse_include_the_same_quoted_source_without_model_calls(stream, include_passages, monkeypatch):`
  - Source: `server/AI_Core/tests/test_document_answers.py:84`

## `server/AI_Core/tests/test_evidence_citations.py`

- Line 7: `def test_process_preserves_verified_page_citation_without_narration():`
  - Source: `server/AI_Core/tests/test_evidence_citations.py:7`

- Line 23: `def test_invalid_page_is_not_added_to_evidence(page_number):`
  - Source: `server/AI_Core/tests/test_evidence_citations.py:23`

## `server/AI_Core/tests/test_financial_calculators.py`

- Line 4: `def test_assess_risk_profile_mapping():`
  - Source: `server/AI_Core/tests/test_financial_calculators.py:4`

- Line 15: `def test_calculate_loan_payment_returns_positive_values():`
  - Source: `server/AI_Core/tests/test_financial_calculators.py:15`

- Line 27: `def test_calculate_loan_payment_edge_cases():`
  - Source: `server/AI_Core/tests/test_financial_calculators.py:27`

- Line 36: `def test_calculate_compound_interest():`
  - Source: `server/AI_Core/tests/test_financial_calculators.py:36`

- Line 45: `def test_calculate_retirement_savings_edge_cases():`
  - Source: `server/AI_Core/tests/test_financial_calculators.py:45`

- Line 69: `def test_calculate_debt_snowball_edge_cases():`
  - Source: `server/AI_Core/tests/test_financial_calculators.py:69`

## `server/AI_Core/tests/test_financial_educator_cache.py`

- Line 15: `def test_specific_compound_interest_concept_takes_priority():`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:15`

- Line 20: `def test_hypothetical_compound_interest_and_rate_follow_up_use_the_calculator(monkeypatch, conversation_mode):`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:20`

- Line 49: `def test_compound_interest_question_with_formula_requirements_uses_chat(monkeypatch):`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:49`

- Line 69: `def test_financial_educator_never_reuses_another_users_concept_answer(monkeypatch):`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:69`

- Line 91: `def test_educational_chat_excludes_private_profile_and_unrelated_plan(monkeypatch, stream):`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:91`

- Line 121: `def test_chat_mode_answers_unrelated_questions_without_workspace_plans(monkeypatch, stream):`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:121`

- Line 158: `def test_conversation_reads_selected_attachment_excerpts(monkeypatch):`
  - Source: `server/AI_Core/tests/test_financial_educator_cache.py:158`

## `server/AI_Core/tests/test_flat_rate_comparison.py`

- Line 13: `def test_chat_computes_totals_at_the_first_whole_unit_with_no_model():`
  - Source: `server/AI_Core/tests/test_flat_rate_comparison.py:13`

- Line 27: `def test_a_tie_is_not_a_cheaper_option():`
  - Source: `server/AI_Core/tests/test_flat_rate_comparison.py:27`

- Line 33: `def test_extra_requirements_remain_with_the_conversational_agent():`
  - Source: `server/AI_Core/tests/test_flat_rate_comparison.py:33`

## `server/AI_Core/tests/test_handwriting_parser.py`

- Line 5: `def test_extract_handwriting_intent_amounts_and_percentages():`
  - Source: `server/AI_Core/tests/test_handwriting_parser.py:5`

## `server/AI_Core/tests/test_income_analysis_periods.py`

- Line 32: `def test_recorded_cash_flow_uses_calendar_months_instead_of_whole_window(months):`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:32`

- Line 47: `def test_sparse_year_spans_twelve_months_and_does_not_claim_missing_activity_is_zero():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:47`

- Line 59: `def test_calendar_boundary_counts_all_touched_months_without_extrapolating_partial_months():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:59`

- Line 69: `def test_spending_trends_use_recorded_local_months_and_exclude_investments():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:69`

- Line 86: `def test_invalid_or_unknown_dates_preserve_period_totals_but_leave_monthly_values_unknown(bad_date):`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:86`

- Line 98: `def test_real_profile_monthly_values_take_precedence_over_recorded_window():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:98`

- Line 109: `def test_explicit_zero_recorded_flow_is_preserved_and_is_not_a_negative_deficit():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:109`

- Line 119: `def test_explicit_no_income_with_recorded_profile_expenses_does_not_invent_a_savings_rate():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:119`

- Line 126: `def test_unknown_or_nonfinite_monthly_values_cannot_promote_total_period_cash_flow(flow):`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:126`

- Line 133: `def test_legacy_period_only_summary_is_labeled_without_claiming_monthly_coverage():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:133`

- Line 141: `def test_income_narrative_uses_request_currency_without_cross_request_state():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:141`

- Line 153: `def test_dispatch_and_cache_inputs_include_the_profile_currency():`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:153`

- Line 168: `def test_legacy_master_synthesis_helpers_keep_period_and_monthly_cash_flow_distinct(summary, label):`
  - Source: `server/AI_Core/tests/test_income_analysis_periods.py:168`

## `server/AI_Core/tests/test_internal_auth.py`

- Line 6: `def test_internal_transport_rejects_missing_and_incorrect_tokens(monkeypatch):`
  - Source: `server/AI_Core/tests/test_internal_auth.py:6`

- Line 14: `def test_internal_transport_accepts_the_matching_gateway_token(monkeypatch):`
  - Source: `server/AI_Core/tests/test_internal_auth.py:14`

## `server/AI_Core/tests/test_key_pool.py`

- Line 58: `def test_discovers_single_key(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:58`

- Line 68: `def test_discovers_numbered_keys(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:68`

- Line 77: `def test_discovers_array_keys(self, mock_env_array_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:77`

- Line 86: `def test_discovers_json_array_keys(self, monkeypatch):`
  - Source: `server/AI_Core/tests/test_key_pool.py:86`

- Line 97: `def test_no_keys_available(self, monkeypatch):`
  - Source: `server/AI_Core/tests/test_key_pool.py:97`

- Line 112: `def test_round_robin_rotation(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:112`

- Line 130: `def test_least_used_rotation(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:130`

- Line 144: `def test_health_weighted_rotation(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:144`

- Line 163: `def test_success_updates_metrics(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:163`

- Line 178: `def test_failure_updates_metrics(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:178`

- Line 191: `def test_rate_limit_error_tracking(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:191`

- Line 203: `def test_access_denied_tracking(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:203`

- Line 218: `def test_429_triggers_cooldown(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:218`

- Line 235: `def test_cooldown_expires(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:235`

- Line 256: `def test_circuit_opens_after_consecutive_failures(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:256`

- Line 274: `def test_circuit_closes_on_success(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:274`

- Line 300: `def test_success_resets_consecutive_failures(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:300`

- Line 320: `def test_get_key_pool_creates_singleton(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:320`

- Line 326: `def test_different_providers_have_different_pools(self, monkeypatch):`
  - Source: `server/AI_Core/tests/test_key_pool.py:326`

- Line 337: `def test_get_all_key_pools(self, monkeypatch):`
  - Source: `server/AI_Core/tests/test_key_pool.py:337`

- Line 348: `def test_reset_all_key_pools(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:348`

- Line 360: `def test_stats_reflect_key_state(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:360`

- Line 378: `def test_stats_count_key_statuses(self, mock_env_multi_keys):`
  - Source: `server/AI_Core/tests/test_key_pool.py:378`

- Line 408: `def test_to_safe_dict_hides_full_key(self, monkeypatch):`
  - Source: `server/AI_Core/tests/test_key_pool.py:408`

- Line 423: `def test_health_to_dict(self, mock_env_single_key):`
  - Source: `server/AI_Core/tests/test_key_pool.py:423`

## `server/AI_Core/tests/test_llm_cache.py`

- Line 17: `def test_key_is_tenant_scoped_and_prompt_sensitive():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:17`

- Line 24: `def test_scope_contextvar_feeds_key():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:24`

- Line 34: `def test_temperature_gate():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:34`

- Line 40: `def test_hit_after_miss_and_empty_not_cached():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:40`

- Line 59: `def test_ttl_expiry():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:59`

- Line 68: `def test_lru_eviction():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:68`

- Line 77: `def test_concurrent_identical_misses_coalesce():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:77`

- Line 101: `def test_leader_failure_is_not_cached_and_followers_recompute():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:101`

- Line 110: `def test_dead_redis_degrades_to_lru():`
  - Source: `server/AI_Core/tests/test_llm_cache.py:110`

## `server/AI_Core/tests/test_llm_wrapper.py`

- Line 24: `def test_global_gemini_selection_overrides_agent_defaults(monkeypatch, agent_type):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:24`

- Line 32: `def test_explicit_provider_does_not_receive_another_providers_model(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:32`

- Line 40: `def test_provider_override_without_model_uses_its_default(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:40`

- Line 49: `def test_retired_models_are_excluded_even_when_explicitly_preferred(provider, model):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:49`

- Line 77: `def test_rotates_to_next_key_on_rate_limit(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:77`

- Line 101: `def test_falls_back_to_next_model_on_404(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:101`

- Line 127: `def test_optional_attempt_budget_bounds_failover_and_outer_retries(monkeypatch, failure, budget):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:127`

- Line 147: `def test_optional_attempt_budget_resets_for_each_invocation(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:147`

- Line 157: `def test_bounded_invocation_does_not_restart_an_exhausted_single_candidate(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:157`

- Line 175: `def test_fails_over_to_next_provider(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:175`

- Line 199: `def test_secure_fallback_redacts_secrets(monkeypatch):`
  - Source: `server/AI_Core/tests/test_llm_wrapper.py:199`

## `server/AI_Core/tests/test_master_agent_routing.py`

- Line 6: `def test_routing_define_compound_interest_goes_to_education():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:6`

- Line 16: `def test_chat_planner_requires_financial_scope():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:16`

- Line 24: `def test_hypothetical_compound_interest_with_amounts_goes_to_education():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:24`

- Line 38: `def test_routing_personal_credit_card_interest_goes_to_debt_optimization():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:38`

- Line 48: `def test_routing_first_person_learning_intro_goes_to_education():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:48`

- Line 61: `def test_educational_follow_up_reuses_the_example_without_ledger_context():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:61`

- Line 78: `def test_generic_debt_comparison_does_not_run_personal_debt_workflow():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:78`

- Line 86: `def test_explaining_debt_avalanche_with_rates_uses_financial_education():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:86`

- Line 102: `def test_generic_example_continues_the_educational_topic():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:102`

- Line 112: `def test_hypothetical_variable_rate_risk_routes_to_education():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:112`

- Line 119: `def test_savings_concept_comparison_routes_to_education_without_generic_example_keyword():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:119`

- Line 126: `def test_definition_follow_up_classifies_a_mixed_expense():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:126`

- Line 140: `def test_comparison_follow_up_applies_the_earlier_concepts_to_a_new_example():`
  - Source: `server/AI_Core/tests/test_master_agent_routing.py:140`

## `server/AI_Core/tests/test_memory_store.py`

- Line 7: `def test_memory_store_upsert_and_search():`
  - Source: `server/AI_Core/tests/test_memory_store.py:7`

- Line 40: `def test_extract_memories():`
  - Source: `server/AI_Core/tests/test_memory_store.py:40`

- Line 51: `def test_memory_store_search_ranked():`
  - Source: `server/AI_Core/tests/test_memory_store.py:51`

- Line 90: `def test_reciprocal_rank_fusion():`
  - Source: `server/AI_Core/tests/test_memory_store.py:90`

- Line 124: `def test_api_memory_endpoints():`
  - Source: `server/AI_Core/tests/test_memory_store.py:124`

## `server/AI_Core/tests/test_metric_answers.py`

- Line 12: `def test_direct_metric_answer_contains_income_and_calculation():`
  - Source: `server/AI_Core/tests/test_metric_answers.py:12`

- Line 21: `def test_ratio_does_not_invent_a_value_when_income_is_missing_or_zero(income):`
  - Source: `server/AI_Core/tests/test_metric_answers.py:21`

- Line 27: `def test_missing_payments_are_distinguished_from_an_empty_debt_list():`
  - Source: `server/AI_Core/tests/test_metric_answers.py:27`

- Line 32: `def test_unrelated_questions_do_not_get_a_metric_prefix():`
  - Source: `server/AI_Core/tests/test_metric_answers.py:32`

- Line 36: `def test_synthesis_keeps_direct_answer_and_does_not_invoke_narration():`
  - Source: `server/AI_Core/tests/test_metric_answers.py:36`

- Line 45: `def test_direct_metric_answer_total_debt_and_savings_rate():`
  - Source: `server/AI_Core/tests/test_metric_answers.py:45`

## `server/AI_Core/tests/test_metrics_auth.py`

- Line 9: `def test_metrics_disabled_when_token_missing(monkeypatch: pytest.MonkeyPatch):`
  - Source: `server/AI_Core/tests/test_metrics_auth.py:9`

- Line 18: `def test_metrics_requires_bearer_token(monkeypatch: pytest.MonkeyPatch):`
  - Source: `server/AI_Core/tests/test_metrics_auth.py:18`

## `server/AI_Core/tests/test_mock_llm.py`

- Line 23: `def test_mock_disabled_by_default(monkeypatch):`
  - Source: `server/AI_Core/tests/test_mock_llm.py:23`

- Line 30: `def test_invoke_returns_canned_message(mock_env):`
  - Source: `server/AI_Core/tests/test_mock_llm.py:30`

- Line 41: `def test_invoke_with_fallback_never_uses_fallback(mock_env):`
  - Source: `server/AI_Core/tests/test_mock_llm.py:41`

- Line 48: `def test_route_snapshot_reports_mock(mock_env):`
  - Source: `server/AI_Core/tests/test_mock_llm.py:48`

- Line 54: `def test_latency_is_configurable_and_clamped(mock_env, monkeypatch):`
  - Source: `server/AI_Core/tests/test_mock_llm.py:54`

## `server/AI_Core/tests/test_plan_builder_actions.py`

- Line 6: `def test_plan_builder_action_items_have_kind_and_due_days():`
  - Source: `server/AI_Core/tests/test_plan_builder_actions.py:6`

- Line 34: `def test_plan_builder_preserves_specialist_percentage_points():`
  - Source: `server/AI_Core/tests/test_plan_builder_actions.py:34`

- Line 60: `def test_plan_markdown_uses_currency_code():`
  - Source: `server/AI_Core/tests/test_plan_builder_actions.py:60`

- Line 84: `def test_plan_currency_rounds_half_up_to_match_client_formatting():`
  - Source: `server/AI_Core/tests/test_plan_builder_actions.py:84`

- Line 96: `def test_empty_profile_income_and_expenses_do_not_invent_zero_cash_flow():`
  - Source: `server/AI_Core/tests/test_plan_builder_actions.py:96`

## `server/AI_Core/tests/test_plan_contract_fixture.py`

- Line 9: `def test_plan_contract_fixture_validates_against_pydantic_model():`
  - Source: `server/AI_Core/tests/test_plan_contract_fixture.py:9`

## `server/AI_Core/tests/test_process_contract.py`

- Line 72: `def test_process_contract_minimal_profile():`
  - Source: `server/AI_Core/tests/test_process_contract.py:72`

- Line 88: `def test_process_contract_full_profile():`
  - Source: `server/AI_Core/tests/test_process_contract.py:88`

- Line 108: `def test_process_contract_no_profile_education_path():`
  - Source: `server/AI_Core/tests/test_process_contract.py:108`

- Line 165: `def test_process_contract_golden_prompts_validate_schema():`
  - Source: `server/AI_Core/tests/test_process_contract.py:165`

## `server/AI_Core/tests/test_provider_env.py`

- Line 12: `def test_resolve_env_file_candidates_lists_server_then_ai_core():`
  - Source: `server/AI_Core/tests/test_provider_env.py:12`

- Line 21: `def test_validate_api_key_raises_when_missing(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_env.py:21`

- Line 39: `def test_validate_api_key_passes_when_present(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_env.py:39`

- Line 45: `def test_gnani_chat_client_uses_configured_endpoint_and_model():`
  - Source: `server/AI_Core/tests/test_provider_env.py:45`

- Line 84: `def test_gnani_voice_key_does_not_configure_reasoning(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_env.py:84`

- Line 95: `def test_resolve_provider_chain_prefers_selected_provider_and_keeps_configured_fallbacks(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_env.py:95`

- Line 112: `def test_resolve_provider_chain_includes_preferred_provider_even_without_key(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_env.py:112`

- Line 123: `def test_fireworks_uses_its_own_default_model_and_endpoint(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_env.py:123`

## `server/AI_Core/tests/test_provider_usage.py`

- Line 11: `def test_openai_compatible_response_uses_langchain_token_schema(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_usage.py:11`

- Line 33: `def test_cooled_down_key_is_not_reused_from_environment(monkeypatch):`
  - Source: `server/AI_Core/tests/test_provider_usage.py:33`

## `server/AI_Core/tests/test_public_web_research.py`

- Line 8: `def test_research_links_only_opened_sources_and_resolves_provider_references():`
  - Source: `server/AI_Core/tests/test_public_web_research.py:8`

- Line 23: `def test_research_without_an_opened_source_does_not_display_the_models_claim():`
  - Source: `server/AI_Core/tests/test_public_web_research.py:23`

- Line 30: `def test_research_uses_the_direct_response_contract(monkeypatch):`
  - Source: `server/AI_Core/tests/test_public_web_research.py:30`

## `server/AI_Core/tests/test_receipt_parser.py`

- Line 5: `def test_extract_receipt_basic_fields():`
  - Source: `server/AI_Core/tests/test_receipt_parser.py:5`

## `server/AI_Core/tests/test_redis_optional_cache.py`

- Line 53: `def test_set_get_roundtrip_through_redis_and_tenant_namespacing():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:53`

- Line 71: `def test_local_lru_hit_does_not_touch_redis():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:71`

- Line 80: `def test_non_json_roundtrippable_values_stay_local():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:80`

- Line 90: `def test_dead_redis_degrades_to_local_and_short_circuits():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:90`

- Line 102: `def test_circuit_closes_after_window():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:102`

- Line 111: `def test_invalidate_pattern_and_clear_hit_redis():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:111`

- Line 126: `def test_missing_redis_package_is_disabled_not_fatal(monkeypatch):`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:126`

- Line 133: `def test_factory_picks_class_from_env(monkeypatch):`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:133`

- Line 140: `def test_singletons_are_response_caches():`
  - Source: `server/AI_Core/tests/test_redis_optional_cache.py:140`

## `server/AI_Core/tests/test_request_ids.py`

- Line 17: `def test_valid_request_ids_pass_through(value):`
  - Source: `server/AI_Core/tests/test_request_ids.py:17`

- Line 25: `def test_malformed_request_ids_are_replaced(value):`
  - Source: `server/AI_Core/tests/test_request_ids.py:25`

- Line 32: `def test_missing_request_id_generates_one_without_flagging():`
  - Source: `server/AI_Core/tests/test_request_ids.py:32`

- Line 38: `def test_parse_traceparent():`
  - Source: `server/AI_Core/tests/test_request_ids.py:38`

- Line 53: `def test_middleware_echoes_valid_and_replaces_malformed_ids(monkeypatch):`
  - Source: `server/AI_Core/tests/test_request_ids.py:53`

## `server/AI_Core/tests/test_scenario_contract.py`

- Line 28: `def test_what_if_scenario_contract_and_profile_aware_fields():`
  - Source: `server/AI_Core/tests/test_scenario_contract.py:28`

- Line 55: `def test_investment_scenario_returns_projected_value_shape():`
  - Source: `server/AI_Core/tests/test_scenario_contract.py:55`

## `server/AI_Core/tests/test_session_authorization.py`

- Line 49: `def test_session_routes_require_and_enforce_gateway_actor(monkeypatch):`
  - Source: `server/AI_Core/tests/test_session_authorization.py:49`

## `server/AI_Core/tests/test_session_manager.py`

- Line 50: `def test_create_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:50`

- Line 65: `def test_create_session_with_profile(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:65`

- Line 75: `def test_create_session_custom_expiration(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:75`

- Line 88: `def test_get_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:88`

- Line 97: `def test_get_nonexistent_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:97`

- Line 101: `def test_get_resumable_sessions(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:101`

- Line 122: `def test_update_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:122`

- Line 133: `def test_complete_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:133`

- Line 142: `def test_complete_session_wraps_scalar_output_for_checkpoint(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:142`

- Line 151: `def test_fail_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:151`

- Line 166: `def test_save_checkpoint(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:166`

- Line 185: `def test_save_multiple_checkpoints(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:185`

- Line 200: `def test_get_latest_checkpoint(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:200`

- Line 211: `def test_get_latest_checkpoint_by_phase(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:211`

- Line 222: `def test_checkpoint_updates_session(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:222`

- Line 240: `def test_checkpoint_with_error(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:240`

- Line 257: `def test_compact_memory_rolling_summary(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:257`

- Line 277: `def test_compact_memory_truncates_long_summary(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:277`

- Line 289: `def test_compact_memory_decisions(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:289`

- Line 306: `def test_compact_memory_limits_decisions(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:306`

- Line 319: `def test_compact_memory_goals(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:319`

- Line 348: `def test_add_user_fact(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:348`

- Line 362: `def test_add_artifact_ref(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:362`

- Line 372: `def test_add_duplicate_artifact_ref(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:372`

- Line 385: `def test_cleanup_expired_sessions(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:385`

- Line 404: `def test_expired_sessions_not_in_resumable(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:404`

- Line 425: `def test_get_stats(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:425`

- Line 446: `def test_session_state_to_dict(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:446`

- Line 460: `def test_session_state_from_dict(self):`
  - Source: `server/AI_Core/tests/test_session_manager.py:460`

- Line 479: `def test_checkpoint_serialization(self, session_manager):`
  - Source: `server/AI_Core/tests/test_session_manager.py:479`

## `server/AI_Core/tests/test_shared_executor.py`

- Line 6: `def test_shared_executor_is_singleton_and_bounded():`
  - Source: `server/AI_Core/tests/test_shared_executor.py:6`

## `server/AI_Core/tests/test_state_store_parity.py`

- Line 65: `def test_session_resume_roundtrip(manager):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:65`

- Line 85: `def test_ensure_session_adopts_unknown_id(manager):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:85`

- Line 92: `def test_cross_tenant_session_is_not_found(manager, store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:92`

- Line 115: `def test_memory_search_scoped_by_org_and_user(store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:115`

- Line 128: `def test_memory_upsert_overwrites_same_key(store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:128`

- Line 136: `def test_memory_search_survives_hostile_query(store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:136`

- Line 144: `def test_boundary_checkpoints_only_at_start_and_end(manager, store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:144`

- Line 163: `def test_failure_flushes_latest_progress_then_error_checkpoint(manager, store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:163`

- Line 177: `def test_every_node_mode_persists_each_checkpoint(store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:177`

- Line 184: `def test_direct_checkpoints_always_persist(manager, store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:184`

- Line 191: `def test_checkpoints_newest_first(manager):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:191`

- Line 203: `def test_ensure_session_fails_soft_when_backend_down(store):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:203`

- Line 225: `def test_ttl_indexes_created_with_defaults(self, mongo):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:225`

- Line 234: `def test_ttl_is_env_configurable_and_reindexed(self, mongo, monkeypatch):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:234`

- Line 245: `def test_ensure_indexes_idempotent(self, mongo):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:245`

- Line 254: `def test_memory_text_index_is_tenant_prefixed(self, mongo):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:254`

- Line 262: `def test_ensure_indexes_fails_soft(self):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:262`

- Line 273: `def test_sqlite_backend_still_reports_fts(tmp_path):`
  - Source: `server/AI_Core/tests/test_state_store_parity.py:273`

## `server/AI_Core/tests/test_sub_agent_manager.py`

- Line 14: `def test_retries_agent_exceptions_then_returns_success_without_mutating_cached_output():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:14`

- Line 32: `def test_retries_error_dicts_and_marks_exhausted_budget():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:32`

- Line 48: `def test_timeout_returns_without_waiting_for_single_or_parallel_agent(parallel):`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:48`

- Line 80: `def test_queued_tasks_fail_gracefully_when_all_worker_slots_time_out():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:80`

- Line 93: `def test_expired_call_does_not_retry_after_it_eventually_fails():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:93`

- Line 121: `def test_failed_dependencies_do_not_run_but_independent_tasks_still_complete():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:121`

- Line 134: `def test_successful_dependencies_are_available_to_the_next_level():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:134`

- Line 143: `def test_rejects_unbounded_timeout_settings(timeout):`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:143`

- Line 149: `def test_rejects_invalid_retry_budgets(retries):`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:149`

- Line 154: `def test_subtask_caching_returns_cached_result_and_skips_worker_dispatch():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:154`

- Line 191: `def test_subtask_caching_differentiates_distinct_inputs():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:191`

- Line 213: `def test_subtask_caching_bypassed_when_use_cache_is_false():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:213`

- Line 233: `def test_subtask_caching_does_not_cache_errors():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:233`

- Line 258: `def test_subtask_caching_invalidates_by_agent_and_clears():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:258`

- Line 292: `def test_cross_session_shared_cache_persistence():`
  - Source: `server/AI_Core/tests/test_sub_agent_manager.py:292`

## `server/AI_Core/tests/test_tenant_isolation.py`

- Line 30: `def test_ensure_session_returns_own_session(manager):`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:30`

- Line 36: `def test_ensure_session_never_returns_another_tenants_session(manager):`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:36`

- Line 51: `def test_ensure_session_unknown_id_is_created_for_caller(manager):`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:51`

- Line 62: `def test_memory_routes_require_actor_headers():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:62`

- Line 74: `def test_memory_routes_reject_body_or_query_ids_that_differ_from_actor():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:74`

- Line 88: `def test_process_rejects_mismatched_actor_instead_of_falling_back():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:88`

- Line 99: `def test_process_requires_headers_in_strict_mode(monkeypatch):`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:99`

- Line 106: `def test_process_stream_rejects_mismatched_actor():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:106`

- Line 133: `def test_build_fts_match_query_quotes_every_token(text, expected):`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:133`

- Line 137: `def test_build_fts_match_query_caps_terms():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:137`

- Line 157: `def test_memory_search_survives_hostile_queries(query):`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:157`

- Line 172: `def test_memory_search_finds_natural_language_question():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:172`

- Line 185: `def test_memory_search_is_tenant_scoped():`
  - Source: `server/AI_Core/tests/test_tenant_isolation.py:185`

## `server/AI_Core/tests/test_vision_dependency_handling.py`

- Line 7: `def test_health_reports_vision_dependency_status():`
  - Source: `server/AI_Core/tests/test_vision_dependency_handling.py:7`

- Line 19: `def test_receipt_parse_returns_503_when_vision_dependencies_missing(monkeypatch):`
  - Source: `server/AI_Core/tests/test_vision_dependency_handling.py:19`

## `server/AI_Core/tests/test_workflow_resume.py`

- Line 16: `def test_workflow_creates_and_resumes_session():`
  - Source: `server/AI_Core/tests/test_workflow_resume.py:16`

- Line 67: `def test_workflow_resumes_legacy_complete_checkpoint_with_scalar_output():`
  - Source: `server/AI_Core/tests/test_workflow_resume.py:67`

