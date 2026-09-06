'use strict';

const { blobstashClient } = require('./storage');

const LINK_ID_BYTES = 22;

/**
 * Stream an incoming upload to storage and return its share id.
 * The stream is handed straight to the storage client — see B-5.
 */
async function storeUpload(accountId, stream, meta) {
  const id = randomLinkId();
  await blobstashClient().putStream(`uploads/${id}`, stream, {
    contentLength: meta.contentLength,
  });
  return { id, accountId, bytes: meta.contentLength };
}

async function readUpload(id) {
  return blobstashClient().getStream(`uploads/${id}`);
}

function randomLinkId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < LINK_ID_BYTES; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

module.exports = { storeUpload, readUpload, randomLinkId };
