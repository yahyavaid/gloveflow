"""Exercise atomic-write and partition-binding contracts without boto3 or AWS."""

from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch, sentinel

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from store import DynamoStore
from service import StoreUnavailable


class ConditionalFailure(Exception):
    pass


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.table = Mock()
        self.table.meta.client.exceptions.ConditionalCheckFailedException = ConditionalFailure
        self.store = DynamoStore(self.table)
        self.conditions = SimpleNamespace(Attr=Mock(), Key=Mock())
        self.conditions.Attr.return_value.not_exists.return_value = sentinel.not_exists
        self.conditions.Key.return_value.eq.return_value = sentinel.user_partition
        self.modules = patch.dict(sys.modules, {
            "boto3": Mock(), "boto3.dynamodb": Mock(),
            "boto3.dynamodb.conditions": self.conditions,
        })
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def test_create_is_atomic_and_never_overwrites(self):
        item, created = self.store.create("alice", {"session_id": "one", "duration_ms": 10})
        self.assertTrue(created)
        self.assertEqual(item["pk"], "USER#alice")
        self.assertEqual(item["sk"], "SESSION#one")
        self.conditions.Attr.assert_called_once_with("pk")
        self.table.put_item.assert_called_once_with(Item=item, ConditionExpression=sentinel.not_exists)
        self.table.get_item.assert_not_called()

    def test_conflict_reads_original_consistently_in_same_partition(self):
        self.table.put_item.side_effect = ConditionalFailure()
        original = {"session_id": "one", "duration_ms": 10}
        self.table.get_item.return_value = {"Item": original}
        item, created = self.store.create("alice", {"session_id": "one", "duration_ms": 20})
        self.assertFalse(created)
        self.assertIs(item, original)
        self.table.get_item.assert_called_once_with(Key={"pk": "USER#alice", "sk": "SESSION#one"}, ConsistentRead=True)
        self.assertEqual(self.table.put_item.call_count, 1)

    def test_create_delete_race_is_retryable(self):
        self.table.put_item.side_effect = ConditionalFailure()
        self.table.get_item.return_value = {}
        with self.assertRaises(StoreUnavailable):
            self.store.create("alice", {"session_id": "one"})

    def test_nonconditional_failure_is_not_mistaken_for_retry(self):
        self.table.put_item.side_effect = RuntimeError("network")
        with self.assertRaises(RuntimeError):
            self.store.create("alice", {"session_id": "one"})
        self.table.get_item.assert_not_called()

    def test_query_binds_cursor_to_verified_user_and_limits_one_page(self):
        self.table.query.return_value = {"Items": [{"session_id": "two"}],
                                       "LastEvaluatedKey": {"pk": "USER#alice", "sk": "SESSION#two"}}
        items, next_id = self.store.list("alice", 3, "one")
        self.conditions.Key.assert_called_once_with("pk")
        self.conditions.Key.return_value.eq.assert_called_once_with("USER#alice")
        self.table.query.assert_called_once_with(KeyConditionExpression=sentinel.user_partition, Limit=3,
                                                ConsistentRead=True, ScanIndexForward=True,
                                                ExclusiveStartKey={"pk": "USER#alice", "sk": "SESSION#one"})
        self.table.scan.assert_not_called()
        self.assertEqual(next_id, "two")
        self.assertEqual(len(items), 1)

    def test_empty_first_page_has_no_cursor(self):
        self.table.query.return_value = {"Items": []}
        self.assertEqual(self.store.list("bob", 10, None), ([], None))
        self.assertNotIn("ExclusiveStartKey", self.table.query.call_args.kwargs)

    def test_delete_can_only_address_callers_partition(self):
        self.store.delete("bob", "alice-session-id")
        self.table.delete_item.assert_called_once_with(Key={"pk": "USER#bob", "sk": "SESSION#alice-session-id"})


if __name__ == "__main__":
    unittest.main()
