"""Exercise the AI Core learning journey without an external model or live services."""

from learning_helpers import add_feedback, add_run, new_prompt

from learning import gate, rollout
from learning.optimizer import Optimizer
from registry.store import ArtifactStore


def test_feedback_candidate_gate_regression_rollback_and_admin_recovery():
    for index in range(4):
        output_id = f"feedback-{index}"
        assert add_run("orgA", f"user-{index}", output_id)
        assert add_feedback("orgA", f"user-{index}", output_id, "down", "too_long")

    def no_model_calls(_system, _user):
        raise AssertionError("the zero-budget optimizer must not call an LLM")

    result = Optimizer("orgA", llm=no_model_calls, budget=0).run()
    candidate = next(item for item in result["candidates"] if item["kind"] == "prompt")
    artifact_id = candidate["artifactId"]
    artifact = ArtifactStore().get(artifact_id)
    assert candidate["gatePassed"] is True
    assert candidate["decision"] == "awaiting_admin"
    assert artifact.status == "draft"
    assert gate.get_gate_report(artifact.eval_report_id)["passed"] is True

    assert rollout.promote(artifact_id, actor="admin1").status == "canary"
    for index in range(6):
        add_run(
            "orgA", f"canary-{index}", f"regression-{index}",
            artifact_ids=[artifact_id], verification_failed=index == 0,
        )
        add_run("orgA", f"baseline-{index}", f"baseline-regression-{index}")
    verdict = rollout.evaluate(ArtifactStore().get(artifact_id))
    assert verdict["action"] == "rollback"
    assert "verification_failure_rate" in verdict["metrics"]["breaches"]
    assert ArtifactStore().get(artifact_id).status == "retired"
    assert any(
        event["auto"] and event["to_status"] == "retired"
        for event in ArtifactStore().list_audit(artifact_id=artifact_id)
    )

    recovery = new_prompt("aggregator.system", "Keep responses concise.", gated=False)
    assert gate.run_gate(recovery).passed
    assert rollout.promote(recovery.id, actor="admin1").status == "canary"
    for step, expected in enumerate(("advance", "advance", "ready_for_promotion")):
        for index in range(6):
            add_run("orgA", f"recovery-{step}-{index}", f"clean-{step}-{index}", artifact_ids=[recovery.id])
            add_run("orgA", f"control-{step}-{index}", f"control-{step}-{index}")
        assert rollout.evaluate(ArtifactStore().get(recovery.id))["action"] == expected
    assert ArtifactStore().get(recovery.id).status == "canary"  # human mode requires explicit approval
    assert rollout.promote(recovery.id, actor="admin1").status == "active"
