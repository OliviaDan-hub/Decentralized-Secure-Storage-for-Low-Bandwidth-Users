// storage-anchor-test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, TupleCV, UIntCV, BufferCV, OptionalCV, BooleanCV, PrincipalCV, ListCV, cvToValue, ResponseCV } from "@stacks/clarity";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_USER_ID = 101;
const ERR_INVALID_FILE_HASH = 102;
const ERR_INVALID_SHARD_COUNT = 103;
const ERR_INVALID_MERKLE_PROOF = 104;
const ERR_INVALID_ROOT_HASH = 105;
const ERR_ANCHOR_ALREADY_EXISTS = 106;
const ERR_ANCHOR_NOT_FOUND = 107;
const ERR_INVALID_TIMESTAMP = 108;
const ERR_PROOF_VERIFICATION_FAILED = 109;
const ERR_INVALID_EXPIRY = 110;
const ERR_ANCHOR_EXPIRED = 111;
const ERR_INVALID_RELAY_FEE = 112;
const ERR_INVALID_OWNER = 113;
const ERR_MAX_ANCHORS_EXCEEDED = 114;
const ERR_INVALID_PROOF_LENGTH = 115;
const ERR_INVALID_HASH_LENGTH = 116;
const ERR_INVALID_SHARD_RANGE = 117;
const ERR_RELAY_NOT_VERIFIED = 118;
const ERR_INVALID_STATUS = 119;
const ERR_INVALID_VERSION = 120;
const ERR_INVALID_METADATA = 121;
const ERR_INVALID_IPFS_CID = 122;
const ERR_INVALID_MERKLE_ROOT = 123;
const ERR_PROOF_MISMATCH = 124;
const ERR_OWNER_NOT_VERIFIED = 125;
const ERR_INVALID_BLOCK_HEIGHT = 126;
const ERR_INVALID_NFT_ID = 127;
const ERR_NFT_NOT_OWNED = 128;
const ERR_INVALID_TRAIT = 129;
const ERR_INVALID_PARAM = 130;

type BufferLength32 = BufferCV & { length: 32 };
type BufferLength46 = BufferCV & { length: 46 };
type BufferLength128 = BufferCV & { length: 128 };

interface Anchor {
  userId: number;
  fileHash: Uint8Array;
  shardCount: number;
  timestamp: number;
  owner: string;
  expiry: number;
  ipfsCid: Uint8Array;
  merkleRoot: Uint8Array;
  status: boolean;
  nftId: number | null;
  metadata: Uint8Array;
}

interface AnchorProof {
  proofs: Uint8Array[];
  verified: boolean;
  verifier: string;
  verifyTimestamp: number;
}

interface Result<T, E> {
  ok: boolean;
  value: T | E;
}

class StorageAnchorMock {
  state: {
    nextAnchorId: number;
    maxAnchors: number;
    relayFee: number;
    authorityPrincipal: string | null;
    anchorExpiry: number;
    proofMaxLength: number;
    hashLength: number;
    shardMin: number;
    shardMax: number;
    contractVersion: number;
    anchors: Map<number, Anchor>;
    anchorsByHash: Map<string, number>;
    anchorProofs: Map<number, AnchorProof>;
    nftContract: { transfer: Function; getOwner: Function } | null;
  } = this.resetState();
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  events: Array<{ event: string; [key: string]: any }> = [];

  private resetState() {
    return {
      nextAnchorId: 0,
      maxAnchors: 10000,
      relayFee: 500,
      authorityPrincipal: null,
      anchorExpiry: 144,
      proofMaxLength: 20,
      hashLength: 32,
      shardMin: 1,
      shardMax: 100,
      contractVersion: 1,
      anchors: new Map(),
      anchorsByHash: new Map(),
      anchorProofs: new Map(),
      nftContract: null,
    };
  }

  constructor() {
    this.reset();
  }

  reset() {
    this.state = this.resetState();
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.events = [];
  }

  setAuthorityPrincipal(principal: string): Result<boolean, number> {
    if (this.state.authorityPrincipal !== null) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityPrincipal = principal;
    return { ok: true, value: true };
  }

  setRelayFee(newFee: number): Result<boolean, number> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newFee <= 0) {
      return { ok: false, value: ERR_INVALID_RELAY_FEE };
    }
    this.state.relayFee = newFee;
    return { ok: true, value: true };
  }

  setMaxAnchors(newMax: number): Result<boolean, number> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newMax <= 0) {
      return { ok: false, value: ERR_INVALID_PARAM };
    }
    this.state.maxAnchors = newMax;
    return { ok: true, value: true };
  }

  setAnchorExpiry(newExpiry: number): Result<boolean, number> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newExpiry <= 0) {
      return { ok: false, value: ERR_INVALID_EXPIRY };
    }
    this.state.anchorExpiry = newExpiry;
    return { ok: true, value: true };
  }

  setNftContract(contract: { transfer: Function; getOwner: Function }): Result<boolean, number> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.nftContract = contract;
    return { ok: true, value: true };
  }

  updateContractVersion(newVersion: number): Result<boolean, number> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newVersion <= this.state.contractVersion) {
      return { ok: false, value: ERR_INVALID_VERSION };
    }
    this.state.contractVersion = newVersion;
    return { ok: true, value: true };
  }

  anchorFile(
    userId: number,
    fileHash: Uint8Array,
    shardCount: number,
    ipfsCid: Uint8Array,
    merkleRoot: Uint8Array,
    metadata: Uint8Array,
    nftId: number | null
  ): Result<number, number> {
    if (this.state.nextAnchorId >= this.state.maxAnchors) {
      return { ok: false, value: ERR_MAX_ANCHORS_EXCEEDED };
    }
    if (userId <= 0) {
      return { ok: false, value: ERR_INVALID_USER_ID };
    }
    if (fileHash.length !== this.state.hashLength) {
      return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    }
    if (shardCount < this.state.shardMin || shardCount > this.state.shardMax) {
      return { ok: false, value: ERR_INVALID_SHARD_RANGE };
    }
    if (ipfsCid.length === 0 || ipfsCid.length > 46) {
      return { ok: false, value: ERR_INVALID_IPFS_CID };
    }
    if (merkleRoot.length !== this.state.hashLength) {
      return { ok: false, value: ERR_INVALID_MERKLE_ROOT };
    }
    if (metadata.length > 128) {
      return { ok: false, value: ERR_INVALID_METADATA };
    }
    const hashKey = fileHash.toString();
    if (this.state.anchorsByHash.has(hashKey)) {
      return { ok: false, value: ERR_ANCHOR_ALREADY_EXISTS };
    }
    if (nftId !== null) {
      if (nftId <= 0) {
        return { ok: false, value: ERR_INVALID_NFT_ID };
      }
      if (!this.state.nftContract) {
        return { ok: false, value: ERR_INVALID_TRAIT };
      }
      const owner = this.state.nftContract.getOwner(nftId);
      if (!owner.ok || owner.value !== this.caller) {
        return { ok: false, value: ERR_NFT_NOT_OWNED };
      }
    }
    if (!this.state.authorityPrincipal) {
      return { ok: false, value: ERR_RELAY_NOT_VERIFIED };
    }
    this.stxTransfers.push({ amount: this.state.relayFee, from: this.caller, to: this.state.authorityPrincipal });

    const id = this.state.nextAnchorId;
    const expiry = this.blockHeight + this.state.anchorExpiry;
    const anchor: Anchor = {
      userId,
      fileHash,
      shardCount,
      timestamp: this.blockHeight,
      owner: this.caller,
      expiry,
      ipfsCid,
      merkleRoot,
      status: true,
      nftId,
      metadata,
    };
    this.state.anchors.set(id, anchor);
    this.state.anchorsByHash.set(hashKey, id);
    this.state.nextAnchorId++;
    this.events.push({ event: "file-anchored", id, hash: fileHash });
    return { ok: true, value: id };
  }

  verifyProof(
    anchorId: number,
    merkleProof: Uint8Array[],
    leafHash: Uint8Array
  ): Result<boolean, number> {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor) {
      return { ok: false, value: ERR_ANCHOR_NOT_FOUND };
    }
    if (!anchor.status) {
      return { ok: false, value: ERR_INVALID_STATUS };
    }
    if (this.blockHeight >= anchor.expiry) {
      return { ok: false, value: ERR_ANCHOR_EXPIRED };
    }
    if (anchor.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (merkleProof.length > this.state.proofMaxLength) {
      return { ok: false, value: ERR_INVALID_PROOF_LENGTH };
    }
    if (leafHash.length !== this.state.hashLength) {
      return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    }
    // Simulate compute-merkle-root
    let computedRoot = leafHash;
    for (const p of merkleProof) {
      computedRoot = new Uint8Array(32); // Mock hash
    }
    if (computedRoot.toString() !== anchor.merkleRoot.toString()) {
      return { ok: false, value: ERR_PROOF_VERIFICATION_FAILED };
    }
    this.state.anchorProofs.set(anchorId, {
      proofs: merkleProof,
      verified: true,
      verifier: this.caller,
      verifyTimestamp: this.blockHeight,
    });
    this.events.push({ event: "proof-verified", id: anchorId });
    return { ok: true, value: true };
  }

  revokeAnchor(anchorId: number): Result<boolean, number> {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor) {
      return { ok: false, value: ERR_ANCHOR_NOT_FOUND };
    }
    if (anchor.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    anchor.status = false;
    this.state.anchors.set(anchorId, anchor);
    this.events.push({ event: "anchor-revoked", id: anchorId });
    return { ok: true, value: true };
  }

  updateAnchorMetadata(anchorId: number, newMetadata: Uint8Array): Result<boolean, number> {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor) {
      return { ok: false, value: ERR_ANCHOR_NOT_FOUND };
    }
    if (anchor.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newMetadata.length > 128) {
      return { ok: false, value: ERR_INVALID_METADATA };
    }
    anchor.metadata = newMetadata;
    this.state.anchors.set(anchorId, anchor);
    this.events.push({ event: "metadata-updated", id: anchorId });
    return { ok: true, value: true };
  }

  transferAnchorOwnership(anchorId: number, newOwner: string): Result<boolean, number> {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor) {
      return { ok: false, value: ERR_ANCHOR_NOT_FOUND };
    }
    if (anchor.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newOwner === this.caller) {
      return { ok: false, value: ERR_INVALID_OWNER };
    }
    anchor.owner = newOwner;
    this.state.anchors.set(anchorId, anchor);
    this.events.push({ event: "ownership-transferred", id: anchorId, newOwner });
    return { ok: true, value: true };
  }

  checkAnchorExistence(hash: Uint8Array): Result<boolean, number> {
    return { ok: true, value: this.state.anchorsByHash.has(hash.toString()) };
  }

  getAnchorCount(): Result<number, number> {
    return { ok: true, value: this.state.nextAnchorId };
  }
}

describe("StorageAnchorMock", () => {
  let contract: StorageAnchorMock;

  beforeEach(() => {
    contract = new StorageAnchorMock();
    contract.reset();
  });

  it("sets authority principal successfully", () => {
    const result = contract.setAuthorityPrincipal("ST2AUTH");
    expect(result.ok).toBe(true);
    expect(contract.state.authorityPrincipal).toBe("ST2AUTH");
  });

  it("anchors file successfully without NFT", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    const result = contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const anchor = contract.state.anchors.get(0);
    expect(anchor?.userId).toBe(1);
    expect(anchor?.shardCount).toBe(5);
    expect(anchor?.status).toBe(true);
    expect(anchor?.nftId).toBe(null);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2AUTH" }]);
    expect(contract.events[0].event).toBe("file-anchored");
  });

  it("rejects anchor with invalid user ID", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    const result = contract.anchorFile(0, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_USER_ID);
  });

  it("rejects duplicate anchor hash", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    const result = contract.anchorFile(2, fileHash, 10, ipfsCid, merkleRoot, metadata, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ANCHOR_ALREADY_EXISTS);
  });

  it("rejects proof verification for non-owner", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    contract.caller = "ST3FAKE";
    const proof: Uint8Array[] = [new Uint8Array(32).fill(5)];
    const leafHash = new Uint8Array(32).fill(1);
    const result = contract.verifyProof(0, proof, leafHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("revokes anchor successfully", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    const result = contract.revokeAnchor(0);
    expect(result.ok).toBe(true);
    const anchor = contract.state.anchors.get(0);
    expect(anchor?.status).toBe(false);
    expect(contract.events[1].event).toBe("anchor-revoked");
  });

  it("updates metadata successfully", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    const newMetadata = new Uint8Array(128).fill(6);
    const result = contract.updateAnchorMetadata(0, newMetadata);
    expect(result.ok).toBe(true);
    const anchor = contract.state.anchors.get(0);
    expect(anchor?.metadata).toEqual(newMetadata);
    expect(contract.events[1].event).toBe("metadata-updated");
  });

  it("transfers ownership successfully", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    const result = contract.transferAnchorOwnership(0, "ST4NEW");
    expect(result.ok).toBe(true);
    const anchor = contract.state.anchors.get(0);
    expect(anchor?.owner).toBe("ST4NEW");
    expect(contract.events[1].event).toBe("ownership-transferred");
  });

  it("checks anchor existence correctly", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    const result = contract.checkAnchorExistence(fileHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("gets anchor count correctly", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash1 = new Uint8Array(32).fill(1);
    const fileHash2 = new Uint8Array(32).fill(7);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash1, 5, ipfsCid, merkleRoot, metadata, null);
    contract.anchorFile(2, fileHash2, 10, ipfsCid, merkleRoot, metadata, null);
    const result = contract.getAnchorCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("sets relay fee successfully", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = contract.setRelayFee(1000);
    expect(result.ok).toBe(true);
    expect(contract.state.relayFee).toBe(1000);
  });

  it("rejects relay fee change by non-authority", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const result = contract.setRelayFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates contract version successfully", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = contract.updateContractVersion(2);
    expect(result.ok).toBe(true);
    expect(contract.state.contractVersion).toBe(2);
  });

  it("rejects anchor when max exceeded", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    contract.state.maxAnchors = 0;
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    const result = contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ANCHORS_EXCEEDED);
  });

  it("rejects proof verification on expired anchor", () => {
    contract.setAuthorityPrincipal("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(1);
    const ipfsCid = new Uint8Array(46).fill(2);
    const merkleRoot = new Uint8Array(32).fill(3);
    const metadata = new Uint8Array(128).fill(4);
    contract.anchorFile(1, fileHash, 5, ipfsCid, merkleRoot, metadata, null);
    contract.blockHeight = 145;
    const proof: Uint8Array[] = [new Uint8Array(32).fill(5)];
    const leafHash = new Uint8Array(32).fill(1);
    const result = contract.verifyProof(0, proof, leafHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ANCHOR_EXPIRED);
  });
});