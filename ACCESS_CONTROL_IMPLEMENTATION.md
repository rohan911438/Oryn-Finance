# Smart Contract Access Control Implementation
## Issue #28 - Enhanced Access Control System

### Overview
This implementation introduces a comprehensive role-based access control (RBAC) system for smart contracts, replacing simple admin checks with sophisticated permission management, user roles, and granular access controls.

### Changes Made

#### 1. **New Access Control Contract** ✓

**Location:** `contracts/access-control/`

**Features Implemented:**
- **Role-based permissions system** with 6 predefined roles:
  - `SuperAdmin`: Full system access (manage roles, emergency actions)
  - `Admin`: User management, market operations, contract control
  - `Moderator`: Content moderation, market resolution
  - `Oracle`: Submit oracle data only
  - `User`: Basic operations (create markets, claim rewards)
  - `Blacklisted`: No permissions

- **Granular permissions** mapped to roles:
  ```rust
  enum Permission {
      CreateMarket, ResolveMarket, ModerateContent,
      ManageUsers, SubmitOracleData, ClaimRewards,
      TransferTokens, PauseContract, EmergencyAction
  }
  ```

- **Hierarchical role management**:
  - SuperAdmin can grant any role
  - Admin can grant Moderator/Oracle/User/Blacklisted roles
  - Moderator can grant User/Blacklisted roles
  - Cannot revoke SuperAdmin role

- **Permission caching** for efficient lookups
- **Event emission** for all access control operations
- **Contract pause/unpause** functionality
- **User blacklist management**

**Key Methods:**
- `grant_role()` / `revoke_role()`: Role management
- `has_permission()` / `require_permission()`: Permission checks
- `pause_contract()` / `unpause_contract()`: Contract control
- `blacklist_user()` / `unblacklist_user()`: User management

#### 2. **Enhanced Market Factory Contract** ✓

**Location:** `contracts/market-factory/src/lib.rs`

**Improvements:**
- **Integrated access control**: Uses permission checks instead of simple admin verification
- **Contract pause/unpause**: Requires `PauseContract` permission
- **User role management**: Delegates to access control contract
- **Blacklist functionality**: Can blacklist users from market creation

**New Methods:**
- `pause_contract()` / `unpause_contract()`: Contract control
- `grant_user_role()` / `revoke_user_role()`: User management
- `blacklist_user()`: User restrictions

#### 3. **Updated Shared Library** ✓

**Location:** `contracts/shared/src/lib.rs`

**Added Types:**
- `Role` enum: All role definitions
- `Permission` enum: All permission types
- Enables type-safe access control across contracts

#### 4. **Backend Configuration Updates** ✓

**Location:** `backend/src/config/contracts.js`

**Updates:**
- Added `ACCESS_CONTROL` contract address placeholder
- Added comprehensive function mappings for access control operations
- Extended market factory function mappings

### Usage Examples

#### Basic Permission Check
```rust
// Check if user can create markets
let access_control = env.storage().persistent()
    .get(&StorageKey::AccessControlContract)?;

let has_permission: bool = env.invoke_contract(
    &access_control,
    &symbol_short!("has_perm"),
    (user, Permission::CreateMarket).into_val(&env)
);
```

#### Role-Based Access Control
```rust
// Grant admin role to user
env.invoke_contract(
    &access_control,
    &symbol_short!("grant_role"),
    (admin, user, Role::Admin).into_val(&env)
);

// Check if user has admin role
let is_admin: bool = env.invoke_contract(
    &access_control,
    &symbol_short!("check_role"),
    (user, Role::Admin).into_val(&env)
);
```

#### Contract Pausing
```rust
// Pause market factory (requires PauseContract permission)
env.invoke_contract(
    &market_factory,
    &symbol_short!("pause_contract"),
    (admin,).into_val(&env)
);
```

#### User Blacklisting
```rust
// Blacklist malicious user
env.invoke_contract(
    &market_factory,
    &symbol_short!("blacklist_user"),
    (admin, bad_user).into_val(&env)
);
```

### Permission Matrix

| Permission | SuperAdmin | Admin | Moderator | Oracle | User | Blacklisted |
|------------|------------|-------|-----------|--------|------|-------------|
| CreateMarket | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| ResolveMarket | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| ModerateContent | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| ManageUsers | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| SubmitOracleData | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| ClaimRewards | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| TransferTokens | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| PauseContract | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| EmergencyAction | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Role Hierarchy

```
SuperAdmin
    ↓ (can grant)
Admin
    ↓ (can grant)
Moderator
    ↓ (can grant)
Oracle | User | Blacklisted
```

### Event System

**Access Control Events:**
- `access_control:initialized` - Contract initialization
- `access_control:role_granted` - User role assignment
- `access_control:role_revoked` - User role removal
- `access_control:contract_paused` - Contract paused
- `access_control:contract_unpaused` - Contract unpaused

**Market Factory Events:**
- `factory:paused` - Market factory paused
- `factory:unpaused` - Market factory unpaused

### Security Features

1. **Hierarchical Permissions**: Higher roles can manage lower roles
2. **Permission Caching**: Efficient permission lookups with caching
3. **Contract Pausing**: Emergency stop functionality
4. **User Blacklisting**: Complete access revocation
5. **Event Auditing**: Complete audit trail of all operations
6. **Authorization Checks**: All sensitive operations require explicit permissions

### Integration Pattern

**For New Contracts:**
```rust
// 1. Add access control contract to storage
env.storage().persistent().set(&StorageKey::AccessControlContract, &access_control_addr);

// 2. Check permissions before sensitive operations
let has_perm: bool = env.invoke_contract(
    &access_control,
    &symbol_short!("has_perm"),
    (caller, Permission::RequiredPermission).into_val(&env)
);
if !has_perm {
    return Err(OrynError::Unauthorized.into());
}
```

**For Existing Contracts:**
```rust
// Replace simple admin checks with permission checks
// OLD: if caller != admin { return Err(...) }
// NEW: require_permission(&env, &caller, Permission::Action)?
```

### Testing

**Comprehensive test suite:** `backend/test-access-control.js`

**Test Coverage:**
- Role management and hierarchy
- Permission checking and enforcement
- Contract pause/unpause functionality
- User blacklist/unblacklist operations
- Event emission verification
- Role permission matrix validation
- Authorization failure scenarios

**Run Tests:**
```bash
cd backend
node test-access-control.js
```

### Deployment Steps

1. **Deploy Access Control Contract**
   ```bash
   cd contracts/access-control
   soroban contract deploy --wasm target/wasm32-unknown-unknown/release/access_control.wasm
   ```

2. **Initialize Access Control**
   ```javascript
   // Set admin as SuperAdmin
   await accessControl.initialize(adminAddress);
   ```

3. **Update Market Factory Config**
   ```javascript
   const factoryConfig = {
       // ... existing config
       access_control_contract: accessControlAddress
   };
   ```

4. **Deploy Updated Market Factory**
   ```bash
   cd contracts/market-factory
   soroban contract deploy --wasm target/wasm32-unknown-unknown/release/market_factory.wasm
   ```

### Migration Strategy

**Backward Compatibility:**
- Existing admin checks remain functional during transition
- New permission system is opt-in per contract
- Gradual migration possible

**Migration Steps:**
1. Deploy access control contract
2. Update contract configurations
3. Redeploy contracts with access control integration
4. Migrate existing admin roles to new system
5. Enable access control checks

### Future Enhancements

1. **Time-Locked Permissions**: Temporary role assignments
2. **Multi-Signature Requirements**: Require multiple admins for critical operations
3. **Permission Delegation**: Allow users to delegate specific permissions
4. **Audit Logging**: Enhanced event logging with more context
5. **Rate Limiting**: Prevent abuse of permission checks
6. **Contract Upgrades**: Permission-controlled contract upgrades

### Files Modified

- `contracts/access-control/src/lib.rs` - New access control contract (NEW)
- `contracts/access-control/Cargo.toml` - Contract configuration (NEW)
- `contracts/shared/src/lib.rs` - Added Role/Permission enums
- `contracts/market-factory/src/lib.rs` - Integrated access control
- `contracts/Cargo.toml` - Added access-control to workspace
- `backend/src/config/contracts.js` - Added contract configuration
- `backend/test-access-control.js` - Comprehensive test suite (NEW)

### Verification Checklist

- ✓ Role-based permission system implemented
- ✓ Hierarchical role management working
- ✓ Permission caching for efficiency
- ✓ Contract pause/unpause functionality
- ✓ User blacklist management operational
- ✓ Event emission for audit trails
- ✓ Market factory integration complete
- ✓ Backend configuration updated
- ✓ Test coverage comprehensive
- ✓ Documentation complete
- ✓ Security features implemented

### Questions or Issues?

The access control system provides enterprise-grade security for the Oryn Finance protocol. All sensitive operations now require explicit permissions, and the hierarchical role system allows for fine-grained access management.

**Ready for deployment and integration!** 🚀