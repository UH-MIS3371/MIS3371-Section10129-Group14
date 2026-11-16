"use strict";
// Small DynamoDB helpers shared by the profile, admin and audit code.
const crypto = require("crypto");
const { GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

async function scanAll(db, TableName) {
  if (!TableName) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...page.Items);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getItem(db, TableName, Key) {
  const found = await db.send(new GetCommand({ TableName, Key }));
  return found.Item;
}

// Saves an item that carries a version number: a new item must not exist yet, an update must still
// have the version it was read with. Returns false when someone else saved it first.
async function saveVersioned(db, TableName, item, keyName) {
  const readVersion = item.version || 0;
  const params = { TableName, Item: { ...item, version: readVersion + 1 } };
  if (readVersion === 0) {
    params.ConditionExpression = "attribute_not_exists(" + keyName + ")";
  } else {
    params.ConditionExpression = "#v = :read";
    params.ExpressionAttributeNames = { "#v": "version" };
    params.ExpressionAttributeValues = { ":read": readVersion };
  }
  try {
    await db.send(new PutCommand(params));
    return params.Item;
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

// Appends one entry to the audit log. Entries are never changed or deleted. Tokens and passwords are never logged.
async function audit(db, actor, action, fields = {}, { strict = false } = {}) {
  if (!process.env.AUDIT_TABLE) return;
  const at = new Date().toISOString();
  const entry = {
    auditId: at + "#" + crypto.randomUUID(), at, action,
    actorId: actor.userId, actorEmail: actor.email, result: "success", ...fields
  };
  try {
    await db.send(new PutCommand({ TableName: process.env.AUDIT_TABLE, Item: entry, ConditionExpression: "attribute_not_exists(auditId)" }));
  } catch (e) {
    if (strict) throw e;
    console.log("Audit write failed:", e);
  }
}

module.exports = { scanAll, getItem, saveVersioned, audit };
