;; storage-anchor.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-USER-ID u101)
(define-constant ERR-INVALID-FILE-HASH u102)
(define-constant ERR-INVALID-SHARD-COUNT u103)
(define-constant ERR-INVALID-MERKLE-PROOF u104)
(define-constant ERR-INVALID-ROOT-HASH u105)
(define-constant ERR-ANCHOR-ALREADY-EXISTS u106)
(define-constant ERR-ANCHOR-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-PROOF-VERIFICATION-FAILED u109)
(define-constant ERR-INVALID-EXPIRY u110)
(define-constant ERR-ANCHOR-EXPIRED u111)
(define-constant ERR-INVALID-RELAY-FEE u112)
(define-constant ERR-INVALID-OWNER u113)
(define-constant ERR-MAX-ANCHORS-EXCEEDED u114)
(define-constant ERR-INVALID-PROOF-LENGTH u115)
(define-constant ERR-INVALID-HASH-LENGTH u116)
(define-constant ERR-INVALID-SHARD-RANGE u117)
(define-constant ERR-RELAY-NOT-VERIFIED u118)
(define-constant ERR-INVALID-STATUS u119)
(define-constant ERR-INVALID-VERSION u120)
(define-constant ERR-INVALID-METADATA u121)
(define-constant ERR-INVALID-IPFS-CID u122)
(define-constant ERR-INVALID-MERKLE-ROOT u123)
(define-constant ERR-PROOF-MISMATCH u124)
(define-constant ERR-OWNER-NOT-VERIFIED u125)
(define-constant ERR-INVALID-BLOCK-HEIGHT u126)
(define-constant ERR-INVALID-NFT-ID u127)
(define-constant ERR-NFT-NOT-OWNED u128)
(define-constant ERR-INVALID-TRAIT u129)
(define-constant ERR-INVALID-PARAM u130)

(define-data-var next-anchor-id uint u0)
(define-data-var max-anchors uint u10000)
(define-data-var relay-fee uint u500)
(define-data-var authority-principal principal .deployer)
(define-data-var anchor-expiry uint u144)
(define-data-var proof-max-length uint u20)
(define-data-var hash-length uint u32)
(define-data-var shard-min uint u1)
(define-data-var shard-max uint u100)
(define-data-var contract-version uint u1)

(define-map anchors
  uint
  {
    user-id: uint,
    file-hash: (buff 32),
    shard-count: uint,
    timestamp: uint,
    owner: principal,
    expiry: uint,
    ipfs-cid: (buff 46),
    merkle-root: (buff 32),
    status: bool,
    nft-id: (optional uint),
    metadata: (buff 128)
  }
)

(define-map anchors-by-hash
  (buff 32)
  uint
)

(define-map anchor-proofs
  uint
  {
    proofs: (list 20 (buff 32)),
    verified: bool,
    verifier: principal,
    verify-timestamp: uint
  }
)

(define-trait nft-trait
  (
    (transfer (uint principal principal) (response bool uint))
    (get-owner (uint) (response (optional principal) uint))
  )
)

(define-read-only (get-anchor (id uint))
  (map-get? anchors id)
)

(define-read-only (get-anchor-proof (id uint))
  (map-get? anchor-proofs id)
)

(define-read-only (is-anchor-registered (hash (buff 32)))
  (is-some (map-get? anchors-by-hash hash))
)

(define-read-only (get-next-anchor-id)
  (ok (var-get next-anchor-id))
)

(define-read-only (get-relay-fee)
  (ok (var-get relay-fee))
)

(define-read-only (get-contract-version)
  (ok (var-get contract-version))
)

(define-private (validate-user-id (user uint))
  (if (> user u0)
    (ok true)
    (err ERR-INVALID-USER-ID)
  )
)

(define-private (validate-file-hash (hash (buff 32)))
  (if (is-eq (len hash) (var-get hash-length))
    (ok true)
    (err ERR-INVALID-HASH-LENGTH)
  )
)

(define-private (validate-shard-count (count uint))
  (if (and (>= count (var-get shard-min)) (<= count (var-get shard-max)))
    (ok true)
    (err ERR-INVALID-SHARD-RANGE)
  )
)

(define-private (validate-merkle-proof (proof (list 20 (buff 32))))
  (if (<= (len proof) (var-get proof-max-length))
    (ok true)
    (err ERR-INVALID-PROOF-LENGTH)
  )
)

(define-private (validate-root-hash (root (buff 32)))
  (if (is-eq (len root) (var-get hash-length))
    (ok true)
    (err ERR-INVALID-MERKLE-ROOT)
  )
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP)
  )
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
    (ok true)
    (err ERR-INVALID-EXPIRY)
  )
)

(define-private (validate-ipfs-cid (cid (buff 46)))
  (if (and (> (len cid) u0) (<= (len cid) u46))
    (ok true)
    (err ERR-INVALID-IPFS-CID)
  )
)

(define-private (validate-metadata (meta (buff 128)))
  (if (<= (len meta) u128)
    (ok true)
    (err ERR-INVALID-METADATA)
  )
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
    (ok true)
    (err ERR-NOT-AUTHORIZED)
  )
)

(define-private (validate-nft-id (id uint))
  (if (> id u0)
    (ok true)
    (err ERR-INVALID-NFT-ID)
  )
)

(define-private (validate-status (stat bool))
  (ok true)
)

(define-private (compute-merkle-root (leaf (buff 32)) (proof (list 20 (buff 32))))
  (fold hash-pair proof leaf)
)

(define-private (hash-pair (prev (buff 32)) (current (buff 32)))
  (sha256 (concat prev current))
)

(define-public (set-relay-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-fee u0) (err ERR-INVALID-RELAY-FEE))
    (var-set relay-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-anchors (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-PARAM))
    (var-set max-anchors new-max)
    (ok true)
  )
)

(define-public (set-anchor-expiry (new-expiry uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-expiry u0) (err ERR-INVALID-EXPIRY))
    (var-set anchor-expiry new-expiry)
    (ok true)
  )
)

(define-public (update-contract-version (new-version uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-version (var-get contract-version)) (err ERR-INVALID-VERSION))
    (var-set contract-version new-version)
    (ok true)
  )
)

(define-public (anchor-file
  (user-id uint)
  (file-hash (buff 32))
  (shard-count uint)
  (ipfs-cid (buff 46))
  (merkle-root (buff 32))
  (metadata (buff 128))
  (nft-id (optional uint))
)
  (let
    (
      (next-id (var-get next-anchor-id))
      (current-max (var-get max-anchors))
      (expiry (+ block-height (var-get anchor-expiry)))
    )
    (asserts! (< next-id current-max) (err ERR-MAX-ANCHORS-EXCEEDED))
    (try! (validate-user-id user-id))
    (try! (validate-file-hash file-hash))
    (try! (validate-shard-count shard-count))
    (try! (validate-ipfs-cid ipfs-cid))
    (try! (validate-root-hash merkle-root))
    (try! (validate-metadata metadata))
    (asserts! (is-none (map-get? anchors-by-hash file-hash)) (err ERR-ANCHOR-ALREADY-EXISTS))
    (match nft-id id
      (begin
        (try! (validate-nft-id id))
        (asserts! (is-eq (unwrap! (contract-call? .nft-contract get-owner id) (err ERR-INVALID-NFT-ID)) tx-sender) (err ERR-NFT-NOT-OWNED))
      )
      true
    )
    (try! (stx-transfer? (var-get relay-fee) tx-sender (var-get authority-principal)))
    (map-set anchors next-id
      {
        user-id: user-id,
        file-hash: file-hash,
        shard-count: shard-count,
        timestamp: block-height,
        owner: tx-sender,
        expiry: expiry,
        ipfs-cid: ipfs-cid,
        merkle-root: merkle-root,
        status: true,
        nft-id: nft-id,
        metadata: metadata
      }
    )
    (map-set anchors-by-hash file-hash next-id)
    (var-set next-anchor-id (+ next-id u1))
    (print { event: "file-anchored", id: next-id, hash: file-hash })
    (ok next-id)
  )
)

(define-public (verify-proof
  (anchor-id uint)
  (merkle-proof (list 20 (buff 32)))
  (leaf-hash (buff 32))
)
  (let ((anchor (map-get? anchors anchor-id)))
    (match anchor a
      (begin
        (asserts! (get status a) (err ERR-INVALID-STATUS))
        (asserts! (< block-height (get expiry a)) (err ERR-ANCHOR-EXPIRED))
        (asserts! (is-eq (get owner a) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-merkle-proof merkle-proof))
        (try! (validate-file-hash leaf-hash))
        (let ((computed-root (compute-merkle-root leaf-hash merkle-proof)))
          (asserts! (is-eq computed-root (get merkle-root a)) (err ERR-PROOF-VERIFICATION-FAILED))
        )
        (map-set anchor-proofs anchor-id
          {
            proofs: merkle-proof,
            verified: true,
            verifier: tx-sender,
            verify-timestamp: block-height
          }
        )
        (print { event: "proof-verified", id: anchor-id })
        (ok true)
      )
      (err ERR-ANCHOR-NOT-FOUND)
    )
  )
)

(define-public (revoke-anchor (anchor-id uint))
  (let ((anchor (map-get? anchors anchor-id)))
    (match anchor a
      (begin
        (asserts! (is-eq (get owner a) tx-sender) (err ERR-NOT-AUTHORIZED))
        (map-set anchors anchor-id (merge a { status: false }))
        (print { event: "anchor-revoked", id: anchor-id })
        (ok true)
      )
      (err ERR-ANCHOR-NOT-FOUND)
    )
  )
)

(define-public (update-anchor-metadata (anchor-id uint) (new-metadata (buff 128)))
  (let ((anchor (map-get? anchors anchor-id)))
    (match anchor a
      (begin
        (asserts! (is-eq (get owner a) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-metadata new-metadata))
        (map-set anchors anchor-id (merge a { metadata: new-metadata }))
        (print { event: "metadata-updated", id: anchor-id })
        (ok true)
      )
      (err ERR-ANCHOR-NOT-FOUND)
    )
  )
)

(define-public (transfer-anchor-ownership (anchor-id uint) (new-owner principal))
  (let ((anchor (map-get? anchors anchor-id)))
    (match anchor a
      (begin
        (asserts! (is-eq (get owner a) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-principal new-owner))
        (map-set anchors anchor-id (merge a { owner: new-owner }))
        (print { event: "ownership-transferred", id: anchor-id, new-owner: new-owner })
        (ok true)
      )
      (err ERR-ANCHOR-NOT-FOUND)
    )
  )
)

(define-public (check-anchor-existence (hash (buff 32)))
  (ok (is-anchor-registered hash))
)

(define-public (get-anchor-count)
  (ok (var-get next-anchor-id))
)