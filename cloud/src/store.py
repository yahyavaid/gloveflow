"""DynamoDB persistence. A partition is always derived from the verified subject."""

from service import StoreUnavailable


class DynamoStore:
    def __init__(self, table):
        self.table = table

    @staticmethod
    def key(subject, session_id):
        return {"pk": "USER#" + subject, "sk": "SESSION#" + session_id}

    def create(self, subject, item):
        from boto3.dynamodb.conditions import Attr

        key = self.key(subject, item["session_id"])
        record = dict(item, **key)
        try:
            self.table.put_item(Item=record, ConditionExpression=Attr("pk").not_exists())
            return record, True
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            # A lost response or concurrent retry must not overwrite the first write.
            existing = self.table.get_item(Key=key, ConsistentRead=True).get("Item")
            if existing is None:
                raise StoreUnavailable() from None
            return existing, False

    def list(self, subject, limit, after):
        from boto3.dynamodb.conditions import Key

        options = {
            "KeyConditionExpression": Key("pk").eq("USER#" + subject),
            "Limit": limit,
            "ConsistentRead": True,
            "ScanIndexForward": True,
        }
        if after is not None:
            options["ExclusiveStartKey"] = self.key(subject, after)
        # One bounded Query page, never a table scan or unbounded pagination loop.
        result = self.table.query(**options)
        last = result.get("LastEvaluatedKey")
        return result.get("Items", []), last["sk"][len("SESSION#"):] if last else None

    def delete(self, subject, session_id):
        # Missing and other users' IDs both return the same idempotent response.
        self.table.delete_item(Key=self.key(subject, session_id))
