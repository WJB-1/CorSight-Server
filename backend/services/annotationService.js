/**
 * 文旅标注服务 — 直接操作 MongoDB collection
 */

const mongoose = require('mongoose');

function collection() {
  if (!mongoose.connection.db) throw new Error('DB not connected');
  return mongoose.connection.db.collection('annotations');
}

async function getByBbox(west, south, east, north, { category, node_type } = {}) {
  const filter = { deleted: false };
  if (category) filter.category = category;
  if (node_type) filter.node_type = node_type;
  return collection().find(filter).sort({ createdAt: -1 }).limit(500).toArray();
}

async function getAll({ category, node_type, limit = 500 } = {}) {
  const filter = { deleted: false };
  if (category) filter.category = category;
  if (node_type) filter.node_type = node_type;
  return collection().find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

async function create(data) {
  const normalizedType = data.type
    ? data.type.charAt(0).toUpperCase() + data.type.slice(1)
    : 'Polygon';

  const doc = {
    node_type: data.node_type || 'poi',
    type: normalizedType,
    geometry: data.geometry,
    label: data.label || '',
    category: data.category || 'heritage',
    trigger_radius: data.trigger_radius ?? 20,
    knowledge: data.knowledge || {},
    waypoints: data.waypoints || [],
    surface: data.surface || '',
    difficulty: data.difficulty || '',
    prompts: data.prompts || {},
    point_id: data.point_id || null,
    description: data.description || '',
    zoom: data.zoom || null,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection().insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function update(id, data) {
  const _id = new mongoose.Types.ObjectId(id);
  data.updatedAt = new Date();
  const result = await collection().findOneAndUpdate(
    { _id },
    { $set: data },
    { returnDocument: 'after' }
  );
  return result;
}

async function softDelete(id) {
  const _id = new mongoose.Types.ObjectId(id);
  return collection().updateOne(
    { _id },
    { $set: { deleted: true, updatedAt: new Date() } }
  );
}

async function getById(id) {
  return collection().findOne({ _id: new mongoose.Types.ObjectId(id) });
}

module.exports = { getByBbox, getAll, getById, create, update, softDelete };
