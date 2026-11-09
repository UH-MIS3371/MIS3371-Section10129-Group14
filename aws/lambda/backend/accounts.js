"use strict";
// The simulated account (cash and holdings) in DynamoDB, and the one commit that
// saves an accepted trade together with the account change (BR-7).
//
// Accounts table (ACCOUNTS_TABLE), partition key userId (String):
//   { userId, cashCents, holdings: { AAPL: 10, ... }, createdAt, updatedAt }
// Money is stored in whole cents so balances never have rounding errors.
const { GetCommand, PutCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { START_CASH_CENTS, START_SHARES } = require("./market-data");

// Each signed-in user has their own account, keyed by their Cognito user ID (the token's sub claim).
// Reads the account, creating it with the starting values the first time.
async function getOrCreateAccount(db, tableName, userId, nowIso) {
  const found = await db.send(new GetCommand({ TableName: tableName, Key: { userId } }));
  if (found.Item) return found.Item;

  const account = {
    userId,
    cashCents: START_CASH_CENTS,
    holdings: { ...START_SHARES },
    createdAt: nowIso,
    updatedAt: nowIso
  };
  try {
    await db.send(new PutCommand({ TableName: tableName, Item: account, ConditionExpression: "attribute_not_exists(userId)" }));
    return account;
  } catch (e) {
    // Another request created it at the same moment: use that one
    if (e.name !== "ConditionalCheckFailedException") throw e;
    const again = await db.send(new GetCommand({ TableName: tableName, Key: { userId }, ConsistentRead: true }));
    return again.Item;
  }
}

// Saves the Accepted trade record and updates cash and holdings in ONE transaction:
// either both are saved or neither is. The condition re-checks cash (Buy) or shares
// (Sell) inside the commit (BR-4, BR-5), so two orders sent at the same moment can
// never spend the same cash or sell the same shares twice.
// Returns "saved", or "insufficient" when the account changed and the re-check failed.
async function commitTrade(db, { tradesTable, accountsTable, record, priceCents }) {
  const totalCents = priceCents * record.shareQuantity;
  const isBuy = record.tradeType === "Buy";
  const values = {
    ":cashDelta": isBuy ? -totalCents : totalCents,
    ":qtyDelta": isBuy ? record.shareQuantity : -record.shareQuantity,
    ":zero": 0,
    ":now": record.completedAt
  };
  if (isBuy) values[":minCash"] = totalCents;
  else values[":minShares"] = record.shareQuantity;

  try {
    await db.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tradesTable,
            Item: record,
            ConditionExpression: "attribute_not_exists(transactionId)"
          }
        },
        {
          Update: {
            TableName: accountsTable,
            Key: { userId: record.userId },
            UpdateExpression: "SET cashCents = cashCents + :cashDelta, holdings.#symbol = if_not_exists(holdings.#symbol, :zero) + :qtyDelta, updatedAt = :now",
            ConditionExpression: isBuy ? "cashCents >= :minCash" : "holdings.#symbol >= :minShares",
            ExpressionAttributeNames: { "#symbol": record.stockSymbol },
            ExpressionAttributeValues: values
          }
        }
      ]
    }));
    return "saved";
  } catch (e) {
    const reasons = e.CancellationReasons || [];
    if (e.name === "TransactionCanceledException" && reasons[1] && reasons[1].Code === "ConditionalCheckFailed") {
      return "insufficient";
    }
    throw e;
  }
}

// What the browser is allowed to see about the account
function publicAccount(account) {
  return { cashCents: account.cashCents, holdings: { ...account.holdings } };
}

module.exports = { getOrCreateAccount, commitTrade, publicAccount };
