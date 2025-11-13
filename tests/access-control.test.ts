import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, principalCV, noneCV, someCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_FILE_ID = 101;
const ERR_INVALID_PERM_TYPE = 102;
const ERR_TOKEN_ALREADY_EXISTS = 103;
const ERR_TOKEN_NOT_FOUND = 104;
const ERR_INVALID_EXPIRY = 105;
const ERR_TOKEN_EXPIRED = 106;
const ERR_INVALID_RECIPIENT = 107;
const ERR_MAX_TOKENS_EXCEEDED = 108;
const ERR_INVALID_METADATA = 109;
const ERR_GROUP_NOT_FOUND = 110;
const ERR_INVALID_GROUP_ID = 111;

interface AccessToken {
  fileId: number;
  recipient: string;
  permType: number;
  expiry: number;
  issuer: string;
  metadata: string;
  groupId: number | null;
  active: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AccessControlMock {
  state: {
    nextTokenId: number;
    maxTokens: number;
    authorityContract: string | null;
    accessTokens: Map<number, AccessToken>;
    fileAccess: Map<string, number>;
    groupMembers: Map<string, boolean>;
  } = {
    nextTokenId: 0,
    maxTokens: 10000,
    authorityContract: null,
    accessTokens: new Map(),
    fileAccess: new Map(),
    groupMembers: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextTokenId: 0,
      maxTokens: 10000,
      authorityContract: null,
      accessTokens: new Map(),
      fileAccess: new Map(),
      groupMembers: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  grantAccess(
    fileId: number,
    recipient: string,
    permType: number,
    expiry: number,
    metadata: string,
    groupId: number | null
  ): Result<number> {
    if (this.state.nextTokenId >= this.state.maxTokens) {
      return { ok: false, value: ERR_MAX_TOKENS_EXCEEDED };
    }
    if (fileId <= 0) return { ok: false, value: ERR_INVALID_FILE_ID };
    if (![1, 2, 3].includes(permType)) return { ok: false, value: ERR_INVALID_PERM_TYPE };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (recipient === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (groupId !== null && groupId <= 0) return { ok: false, value: ERR_INVALID_GROUP_ID };
    if (groupId !== null && !this.state.groupMembers.get(`${groupId}:${recipient}`)) {
      return { ok: false, value: ERR_GROUP_NOT_FOUND };
    }
    const fileAccessKey = `${fileId}:${recipient}`;
    if (this.state.fileAccess.has(fileAccessKey)) {
      return { ok: false, value: ERR_TOKEN_ALREADY_EXISTS };
    }
    const tokenId = this.state.nextTokenId;
    const token: AccessToken = {
      fileId,
      recipient,
      permType,
      expiry,
      issuer: this.caller,
      metadata,
      groupId,
      active: true,
    };
    this.state.accessTokens.set(tokenId, token);
    this.state.fileAccess.set(fileAccessKey, tokenId);
    this.state.nextTokenId++;
    return { ok: true, value: tokenId };
  }

  revokeAccess(tokenId: number): Result<boolean> {
    const token = this.state.accessTokens.get(tokenId);
    if (!token) return { ok: false, value: false };
    if (token.issuer !== this.caller) return { ok: false, value: false };
    if (!token.active) return { ok: false, value: false };
    this.state.accessTokens.set(tokenId, { ...token, active: false });
    this.state.fileAccess.delete(`${token.fileId}:${token.recipient}`);
    return { ok: true, value: true };
  }

  transferToken(tokenId: number, newRecipient: string): Result<boolean> {
    const token = this.state.accessTokens.get(tokenId);
    if (!token) return { ok: false, value: false };
    if (token.recipient !== this.caller) return { ok: false, value: false };
    if (!token.active) return { ok: false, value: false };
    if (newRecipient === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    const updatedToken = { ...token, recipient: newRecipient };
    this.state.accessTokens.set(tokenId, updatedToken);
    this.state.fileAccess.delete(`${token.fileId}:${token.recipient}`);
    this.state.fileAccess.set(`${token.fileId}:${newRecipient}`, tokenId);
    return { ok: true, value: true };
  }

  addGroupMember(groupId: number, member: string): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (member === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    this.state.groupMembers.set(`${groupId}:${member}`, true);
    return { ok: true, value: true };
  }

  removeGroupMember(groupId: number, member: string): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.groupMembers.delete(`${groupId}:${member}`);
    return { ok: true, value: true };
  }

  getToken(tokenId: number): AccessToken | null {
    return this.state.accessTokens.get(tokenId) || null;
  }

  getFileAccess(fileId: number, recipient: string): number | null {
    return this.state.fileAccess.get(`${fileId}:${recipient}`) || null;
  }

  isGroupMember(groupId: number, member: string): boolean {
    return this.state.groupMembers.get(`${groupId}:${member}`) || false;
  }

  checkAccess(fileId: number, recipient: string): Result<boolean> {
    const tokenId = this.state.fileAccess.get(`${fileId}:${recipient}`);
    if (!tokenId) return { ok: true, value: false };
    const token = this.state.accessTokens.get(tokenId);
    if (!token) return { ok: false, value: false };
    if (!token.active || token.expiry <= this.blockHeight) {
      return { ok: true, value: false };
    }
    return { ok: true, value: true };
  }
}

describe("AccessControl", () => {
  let contract: AccessControlMock;

  beforeEach(() => {
    contract = new AccessControlMock();
    contract.reset();
  });

  it("rejects grant with invalid file ID", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(0, "ST2RECIPIENT", 1, 200, "view-access", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FILE_ID);
  });

  it("rejects grant with invalid permission type", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(1, "ST2RECIPIENT", 4, 200, "view-access", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERM_TYPE);
  });

  it("rejects grant with expired timestamp", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(1, "ST2RECIPIENT", 1, 50, "view-access", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPIRY);
  });

  it("rejects grant with invalid recipient", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(1, "SP000000000000000000002Q6VF78", 1, 200, "view-access", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RECIPIENT);
  });

  it("rejects grant with oversized metadata", () => {
    contract.setAuthorityContract("ST2TEST");
    const longMetadata = "a".repeat(257);
    const result = contract.grantAccess(1, "ST2RECIPIENT", 1, 200, longMetadata, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA);
  });

  it("rejects grant when token already exists", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    const result = contract.grantAccess(1, "ST2RECIPIENT", 2, 200, "edit-access", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOKEN_ALREADY_EXISTS);
  });

  it("rejects grant with max tokens exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxTokens = 1;
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    const result = contract.grantAccess(2, "ST3RECIPIENT", 1, 200, "view-access", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_TOKENS_EXCEEDED);
  });

  it("grants access with group ID successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addGroupMember(1, "ST2RECIPIENT");
    const result = contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const token = contract.getToken(0);
    expect(token?.groupId).toBe(1);
  });

  it("rejects grant with invalid group ID", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_GROUP_ID);
  });

  it("rejects grant for non-group member", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_GROUP_NOT_FOUND);
  });

  it("revokes access successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    const result = contract.revokeAccess(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const token = contract.getToken(0);
    expect(token?.active).toBe(false);
    const access = contract.getFileAccess(1, "ST2RECIPIENT");
    expect(access).toBe(null);
  });

  it("rejects revoke for non-issuer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    contract.caller = "ST3FAKE";
    const result = contract.revokeAccess(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects revoke for non-existent token", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.revokeAccess(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects revoke for already revoked token", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    contract.revokeAccess(0);
    const result = contract.revokeAccess(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects transfer for non-recipient", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    contract.caller = "ST3FAKE";
    const result = contract.transferToken(0, "ST4RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects transfer for non-existent token", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2RECIPIENT";
    const result = contract.transferToken(0, "ST3RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects transfer to invalid recipient", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2RECIPIENT";
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    const result = contract.transferToken(0, "SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("adds group member successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addGroupMember(1, "ST2RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isGroupMember(1, "ST2RECIPIENT")).toBe(true);
  });

  it("rejects add group member without authority", () => {
    const result = contract.addGroupMember(1, "ST2RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("removes group member successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addGroupMember(1, "ST2RECIPIENT");
    const result = contract.removeGroupMember(1, "ST2RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isGroupMember(1, "ST2RECIPIENT")).toBe(false);
  });

  it("rejects remove group member without authority", () => {
    const result = contract.removeGroupMember(1, "ST2RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });


  it("rejects access for expired token", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(1, "ST2RECIPIENT", 1, 200, "view-access", null);
    contract.blockHeight = 300;
    const result = contract.checkAccess(1, "ST2RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });

  it("rejects access for non-existent token", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.checkAccess(1, "ST2RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });


  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects setting authority contract twice", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setAuthorityContract("ST3TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});