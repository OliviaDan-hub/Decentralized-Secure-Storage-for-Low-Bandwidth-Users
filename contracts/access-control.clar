(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-FILE-ID u101)
(define-constant ERR-INVALID-PERM-TYPE u102)
(define-constant ERR-TOKEN-ALREADY-EXISTS u103)
(define-constant ERR-TOKEN-NOT-FOUND u104)
(define-constant ERR-INVALID-EXPIRY u105)
(define-constant ERR-TOKEN-EXPIRED u106)
(define-constant ERR-INVALID-RECIPIENT u107)
(define-constant ERR-MAX-TOKENS-EXCEEDED u108)
(define-constant ERR-INVALID-METADATA u109)
(define-constant ERR-GROUP-NOT-FOUND u110)
(define-constant ERR-INVALID-GROUP-ID u111)

(define-data-var next-token-id uint u0)
(define-data-var max-tokens uint u10000)
(define-data-var authority-contract (optional principal) none)

(define-map access-tokens
  uint
  {
    file-id: uint,
    recipient: principal,
    perm-type: uint,
    expiry: uint,
    issuer: principal,
    metadata: (string-utf8 256),
    group-id: (optional uint),
    active: bool
  }
)

(define-map file-access
  { file-id: uint, recipient: principal }
  uint
)

(define-map group-members
  { group-id: uint, member: principal }
  bool
)

(define-trait access-token-trait
  (
    (transfer (uint principal principal) (response bool uint))
    (get-token-owner (uint) (response principal uint))
  )
)

(define-read-only (get-token (token-id uint))
  (map-get? access-tokens token-id)
)

(define-read-only (get-file-access (file-id uint) (recipient principal))
  (map-get? file-access { file-id: file-id, recipient: recipient })
)

(define-read-only (is-group-member (group-id uint) (member principal))
  (default-to false (map-get? group-members { group-id: group-id, member: member }))
)

(define-read-only (check-access (file-id uint) (recipient principal))
  (let
    (
      (token-id-opt (map-get? file-access { file-id: file-id, recipient: recipient }))
    )
    (match token-id-opt
      token-id
      (let
        (
          (token (unwrap! (map-get? access-tokens token-id) (err ERR-TOKEN-NOT-FOUND)))
        )
        (if (and (get active token) (<= (get expiry token) block-height))
          (ok false)
          (ok (get active token))
        )
      )
      (ok false)
    )
  )
)

(define-private (validate-file-id (file-id uint))
  (if (> file-id u0)
    (ok true)
    (err ERR-INVALID-FILE-ID)
  )
)

(define-private (validate-perm-type (perm-type uint))
  (if (or (is-eq perm-type u1) (is-eq perm-type u2) (is-eq perm-type u3))
    (ok true)
    (err ERR-INVALID-PERM-TYPE)
  )
)

(define-private (validate-expiry (expiry uint))
  (if (> expiry block-height)
    (ok true)
    (err ERR-INVALID-EXPIRY)
  )
)

(define-private (validate-recipient (recipient principal))
  (if (not (is-eq recipient 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-RECIPIENT)
  )
)

(define-private (validate-metadata (metadata (string-utf8 256)))
  (if (<= (len metadata) u256)
    (ok true)
    (err ERR-INVALID-METADATA)
  )
)

(define-private (validate-group-id (group-id (optional uint)))
  (match group-id
    id
    (if (> id u0)
      (ok true)
      (err ERR-INVALID-GROUP-ID)
    )
    (ok true)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-recipient contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (grant-access
  (file-id uint)
  (recipient principal)
  (perm-type uint)
  (expiry uint)
  (metadata (string-utf8 256))
  (group-id (optional uint))
)
  (let
    (
      (next-id (var-get next-token-id))
      (current-max (var-get max-tokens))
    )
    (asserts! (< next-id current-max) (err ERR-MAX-TOKENS-EXCEEDED))
    (try! (validate-file-id file-id))
    (try! (validate-perm-type perm-type))
    (try! (validate-expiry expiry))
    (try! (validate-recipient recipient))
    (try! (validate-metadata metadata))
    (try! (validate-group-id group-id))
    (match group-id
      gid
      (asserts! (is-group-member gid recipient) (err ERR-GROUP-NOT-FOUND))
      true
    )
    (asserts! (is-none (map-get? file-access { file-id: file-id, recipient: recipient })) (err ERR-TOKEN-ALREADY-EXISTS))
    (map-set access-tokens next-id
      {
        file-id: file-id,
        recipient: recipient,
        perm-type: perm-type,
        expiry: expiry,
        issuer: tx-sender,
        metadata: metadata,
        group-id: group-id,
        active: true
      }
    )
    (map-set file-access { file-id: file-id, recipient: recipient } next-id)
    (var-set next-token-id (+ next-id u1))
    (print { event: "access-granted", token-id: next-id, file-id: file-id, recipient: recipient })
    (ok next-id)
  )
)

(define-public (revoke-access (token-id uint))
  (let
    (
      (token-opt (map-get? access-tokens token-id))
    )
    (match token-opt
      token
      (begin
        (asserts! (is-eq (get issuer token) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (get active token) (err ERR-TOKEN-NOT-FOUND))
        (map-set access-tokens token-id
          (merge token { active: false })
        )
        (map-delete file-access { file-id: (get file-id token), recipient: (get recipient token) })
        (print { event: "access-revoked", token-id: token-id })
        (ok true)
      )
      (err ERR-TOKEN-NOT-FOUND)
    )
  )
)

(define-public (transfer-token (token-id uint) (new-recipient principal))
  (let
    (
      (token-opt (map-get? access-tokens token-id))
    )
    (match token-opt
      token
      (begin
        (asserts! (is-eq (get recipient token) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (get active token) (err ERR-TOKEN-NOT-FOUND))
        (try! (validate-recipient new-recipient))
        (map-set access-tokens token-id
          (merge token { recipient: new-recipient })
        )
        (map-delete file-access { file-id: (get file-id token), recipient: (get recipient token) })
        (map-set file-access { file-id: (get file-id token), recipient: new-recipient } token-id)
        (print { event: "token-transferred", token-id: token-id, new-recipient: new-recipient })
        (ok true)
      )
      (err ERR-TOKEN-NOT-FOUND)
    )
  )
)

(define-public (add-group-member (group-id uint) (member principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient member))
    (map-set group-members { group-id: group-id, member: member } true)
    (print { event: "group-member-added", group-id: group-id, member: member })
    (ok true)
  )
)

(define-public (remove-group-member (group-id uint) (member principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (map-delete group-members { group-id: group-id, member: member })
    (print { event: "group-member-removed", group-id: group-id, member: member })
    (ok true)
  )
)