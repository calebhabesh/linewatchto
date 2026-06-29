import os
from typing import Any


def find_running_lab_instances(ec2: Any, tag_key: str, tag_value: str) -> list[str]:
    paginator = ec2.get_paginator("describe_instances")
    pages = paginator.paginate(
        Filters=[
            {"Name": f"tag:{tag_key}", "Values": [tag_value]},
            {"Name": "instance-state-name", "Values": ["running"]},
        ]
    )

    instance_ids: list[str] = []
    for page in pages:
        for reservation in page.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                tags = {tag.get("Key"): tag.get("Value") for tag in instance.get("Tags", [])}
                if (
                    instance.get("State", {}).get("Name") == "running"
                    and tags.get(tag_key) == tag_value
                ):
                    instance_ids.append(instance["InstanceId"])
    return instance_ids


def stop_instances(ec2: Any, instance_ids: list[str]) -> dict[str, Any]:
    if not instance_ids:
        return {"count": 0, "stopped": []}

    ec2.stop_instances(InstanceIds=instance_ids)
    return {"count": len(instance_ids), "stopped": instance_ids}


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    import boto3

    tag_key = os.environ.get("TAG_KEY", "LineWatchAwsLab")
    tag_value = os.environ.get("TAG_VALUE", "true")

    ec2 = boto3.client("ec2")
    instance_ids = find_running_lab_instances(ec2, tag_key, tag_value)
    result = stop_instances(ec2, instance_ids)
    result["tag_key"] = tag_key
    result["tag_value"] = tag_value
    return result
