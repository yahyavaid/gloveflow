"""Lambda entry point. AWS dependencies are loaded only when invoked in Lambda."""

import logging
import os

from service import dispatch, response
from store import DynamoStore

LOG = logging.getLogger(__name__)
_store = None


def get_store():
    global _store
    if _store is None:
        import boto3
        from botocore.config import Config

        dynamodb = boto3.resource(
            "dynamodb",
            region_name=os.environ["AWS_REGION"],
            config=Config(connect_timeout=1, read_timeout=2,
                          retries={"total_max_attempts": 2, "mode": "standard"}),
        )
        _store = DynamoStore(dynamodb.Table(os.environ["TABLE_NAME"]))
    return _store


def lambda_handler(event, _context):
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        return dispatch(event, get_store(), os.environ["APP_CLIENT_ID"])
    except (BotoCoreError, ClientError) as exc:
        # Do not log the event, JWT, subject, aggregate results, or SDK error text.
        LOG.error("Persistence request failed: %s", type(exc).__name__)
        return response(503, {"error": {"code": "temporarily_unavailable", "message": "Retry with the same session_id and payload."}}, {"Retry-After": "2"})
    except Exception as exc:
        LOG.error("Request failed: %s", type(exc).__name__)
        return response(500, {"error": {"code": "internal_error", "message": "The request could not be completed."}})
