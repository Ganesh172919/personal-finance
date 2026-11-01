"""Optional LoRA training. Validation uses only the Python standard library."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_rows(path: Path) -> list[dict]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        messages = row.get("messages", [])
        if [item.get("role") for item in messages] != ["system", "user", "assistant"]:
            raise ValueError(f"{path.name}:{number}: expected system, user, assistant roles")
        if not all(isinstance(item.get("content"), str) and item["content"].strip() for item in messages):
            raise ValueError(f"{path.name}:{number}: empty or invalid message")
        if not row.get("synthetic"):
            raise ValueError(f"{path.name}:{number}: sample data must be marked synthetic")
        rows.append(row)
    if not rows:
        raise ValueError(f"Empty dataset: {path}")
    return rows


def validate(config: dict) -> tuple[list[dict], list[dict]]:
    train = load_rows(ROOT / config["train_file"])
    evaluation = load_rows(ROOT / config["eval_file"])
    prompts = [row["messages"][1]["content"] for row in train + evaluation]
    if len(prompts) != len(set(prompts)):
        raise ValueError("Duplicate prompt or overlap between train and evaluation splits")
    if int(config["max_length"]) < 64 or int(config["lora"]["r"]) < 1:
        raise ValueError("Invalid token length or LoRA rank")
    return train, evaluation


def tokenize_row(row: dict, tokenizer, max_length: int) -> dict:
    messages = row["messages"]
    prompt = tokenizer.apply_chat_template(messages[:-1], tokenize=False, add_generation_prompt=True)
    full = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    prompt_ids = tokenizer(prompt, add_special_tokens=False)["input_ids"]
    ids = tokenizer(full, add_special_tokens=False)["input_ids"]
    if ids[:len(prompt_ids)] != prompt_ids:
        raise ValueError("Chat template does not preserve the assistant prefix")
    if len(ids) > max_length:
        raise ValueError("Training example exceeds max_length; shorten the example instead of truncating the answer")
    labels = [-100] * len(prompt_ids) + ids[len(prompt_ids):]
    if len(labels) <= len(prompt_ids):
        raise ValueError("No assistant tokens available for training")
    return {"input_ids": ids, "attention_mask": [1] * len(ids), "labels": labels}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "config.json")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--max-steps", type=int, help="Use 1 for a small training smoke test")
    parser.add_argument("--cpu", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    train, evaluation = validate(config)
    print(json.dumps({"train_examples": len(train), "eval_examples": len(evaluation), "base_model": config["base_model"]}))
    if args.validate_only:
        return

    import torch
    from peft import LoraConfig, TaskType, get_peft_model
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        DataCollatorForSeq2Seq,
        Trainer,
        TrainingArguments,
        set_seed,
    )

    output = ROOT / config["output_dir"]
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output directory is not empty; choose a new output_dir in the config")
    set_seed(config["seed"])
    tokenizer = AutoTokenizer.from_pretrained(config["base_model"], trust_remote_code=False)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    tokenizer.padding_side = "right"
    use_cuda = torch.cuda.is_available() and not args.cpu
    use_bf16 = use_cuda and torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else torch.float32
    model = AutoModelForCausalLM.from_pretrained(config["base_model"], trust_remote_code=False, torch_dtype=dtype)
    model.config.use_cache = False
    model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, **config["lora"]))
    model.print_trainable_parameters()
    training = dict(config["training"])
    if args.max_steps is not None:
        if args.max_steps < 1:
            raise ValueError("max-steps must be positive")
        training["max_steps"] = args.max_steps
    trainer = Trainer(
        model=model,
        args=TrainingArguments(output_dir=str(output), seed=config["seed"], use_cpu=args.cpu, bf16=use_bf16, **training),
        train_dataset=[tokenize_row(row, tokenizer, config["max_length"]) for row in train],
        eval_dataset=[tokenize_row(row, tokenizer, config["max_length"]) for row in evaluation],
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
    )
    trainer.train()
    trainer.save_model(str(output))
    tokenizer.save_pretrained(str(output))
    metrics = trainer.evaluate()
    manifest = {"base_model": config["base_model"], "config": config, "metrics": metrics,
                "dataset_sha256": {name: hashlib.sha256((ROOT / config[name]).read_bytes()).hexdigest()
                                   for name in ["train_file", "eval_file"]}}
    (output / "training_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Adapter saved to {output}")


if __name__ == "__main__":
    main()
