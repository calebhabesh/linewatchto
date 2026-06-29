#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "infra" / "aws-lab" / "lambda" / "autostop.py"

spec = importlib.util.spec_from_file_location("linewatch_aws_lab_autostop", MODULE_PATH)
autostop = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(autostop)


class FakePaginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **kwargs):
        self.kwargs = kwargs
        return self.pages


class FakeEc2:
    def __init__(self, pages):
        self.paginator = FakePaginator(pages)
        self.stopped = []

    def get_paginator(self, name):
        assert name == "describe_instances"
        return self.paginator

    def stop_instances(self, InstanceIds):
        self.stopped.extend(InstanceIds)
        return {"StoppingInstances": [{"InstanceId": instance_id} for instance_id in InstanceIds]}


class AutoStopTest(unittest.TestCase):
    def test_finds_only_running_lab_instances(self):
        ec2 = FakeEc2([
            {
                "Reservations": [
                    {
                        "Instances": [
                            {
                                "InstanceId": "i-running-lab",
                                "State": {"Name": "running"},
                                "Tags": [{"Key": "LineWatchAwsLab", "Value": "true"}],
                            },
                            {
                                "InstanceId": "i-stopped-lab",
                                "State": {"Name": "stopped"},
                                "Tags": [{"Key": "LineWatchAwsLab", "Value": "true"}],
                            },
                            {
                                "InstanceId": "i-running-other",
                                "State": {"Name": "running"},
                                "Tags": [{"Key": "LineWatchAwsLab", "Value": "false"}],
                            },
                        ]
                    }
                ]
            }
        ])

        result = autostop.find_running_lab_instances(ec2, "LineWatchAwsLab", "true")

        self.assertEqual(result, ["i-running-lab"])

    def test_stops_found_instances(self):
        ec2 = FakeEc2([])

        result = autostop.stop_instances(ec2, ["i-1", "i-2"])

        self.assertEqual(ec2.stopped, ["i-1", "i-2"])
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["stopped"], ["i-1", "i-2"])

    def test_noop_when_no_instances_found(self):
        ec2 = FakeEc2([])

        result = autostop.stop_instances(ec2, [])

        self.assertEqual(ec2.stopped, [])
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["stopped"], [])


if __name__ == "__main__":
    unittest.main()
