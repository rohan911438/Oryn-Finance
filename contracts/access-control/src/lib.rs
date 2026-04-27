#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, Map, Vec, Error, symbol
};

use oryn_shared::OrynError;

contractmeta!(
    key = "Description",
    val = "Oryn Access Control - Role-based permissions for smart contracts"
);

// Role definitions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Role {
    SuperAdmin,    // Can manage all roles and permissions
    Admin,         // Can manage users and basic operations
    Moderator,     // Can moderate content and resolve disputes
    Oracle,        // Can submit oracle data
    User,          // Basic user permissions
    Blacklisted,   // No permissions
}

// Permission definitions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Permission {
    CreateMarket,
    ResolveMarket,
    ModerateContent,
    ManageUsers,
    SubmitOracleData,
    ClaimRewards,
    TransferTokens,
    PauseContract,
    EmergencyAction,
}

// Storage keys
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    Roles(Address),           // User -> Role mapping
    Permissions(Role),        // Role -> Vec<Permission> mapping
    RoleMembers(Role),        // Role -> Vec<Address> mapping
    UserPermissions(Address), // User -> Vec<Permission> mapping (computed)
    Paused,
    Initialized,
}

#[contracttype]
#[derive(Clone)]
pub struct AccessControlEvent {
    pub user: Address,
    pub role: Option<Role>,
    pub permission: Option<Permission>,
    pub action: String,
    pub timestamp: u64,
}

#[contract]
pub struct AccessControlContract;

#[contractimpl]
impl AccessControlContract {

    // ==================== INITIALIZATION ====================

    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        // Set super admin
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Roles(admin.clone()), &Role::SuperAdmin);

        // Initialize role members
        let mut super_admin_members: Vec<Address> = Vec::new(&env);
        super_admin_members.push_back(admin);
        env.storage().persistent().set(&StorageKey::RoleMembers(Role::SuperAdmin), &super_admin_members);

        // Initialize default permissions for each role
        Self::initialize_default_permissions(&env);

        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        // Emit initialization event
        env.events().publish(
            (symbol!("access_control"), symbol!("initialized")),
            AccessControlEvent {
                user: admin,
                role: Some(Role::SuperAdmin),
                permission: None,
                action: "initialize".into(),
                timestamp: env.ledger().timestamp(),
            }
        );

        Ok(())
    }

    fn initialize_default_permissions(env: &Env) {
        // SuperAdmin permissions - all permissions
        let super_admin_perms = vec![
            env,
            Permission::CreateMarket,
            Permission::ResolveMarket,
            Permission::ModerateContent,
            Permission::ManageUsers,
            Permission::SubmitOracleData,
            Permission::ClaimRewards,
            Permission::TransferTokens,
            Permission::PauseContract,
            Permission::EmergencyAction,
        ];
        env.storage().persistent().set(&StorageKey::Permissions(Role::SuperAdmin), &super_admin_perms);

        // Admin permissions
        let admin_perms = vec![
            env,
            Permission::CreateMarket,
            Permission::ResolveMarket,
            Permission::ModerateContent,
            Permission::ManageUsers,
            Permission::SubmitOracleData,
            Permission::ClaimRewards,
            Permission::TransferTokens,
        ];
        env.storage().persistent().set(&StorageKey::Permissions(Role::Admin), &admin_perms);

        // Moderator permissions
        let moderator_perms = vec![
            env,
            Permission::ModerateContent,
            Permission::ResolveMarket,
            Permission::ClaimRewards,
        ];
        env.storage().persistent().set(&StorageKey::Permissions(Role::Moderator), &moderator_perms);

        // Oracle permissions
        let oracle_perms = vec![
            env,
            Permission::SubmitOracleData,
        ];
        env.storage().persistent().set(&StorageKey::Permissions(Role::Oracle), &oracle_perms);

        // User permissions
        let user_perms = vec![
            env,
            Permission::CreateMarket,
            Permission::ClaimRewards,
            Permission::TransferTokens,
        ];
        env.storage().persistent().set(&StorageKey::Permissions(Role::User), &user_perms);

        // Blacklisted - no permissions
        let blacklisted_perms: Vec<Permission> = Vec::new(env);
        env.storage().persistent().set(&StorageKey::Permissions(Role::Blacklisted), &blacklisted_perms);
    }

    // ==================== ROLE MANAGEMENT ====================

    pub fn grant_role(env: Env, granter: Address, user: Address, role: Role) -> Result<(), Error> {
        granter.require_auth();
        Self::require_permission(&env, &granter, Permission::ManageUsers)?;

        // Check if granter has permission to grant this role
        let granter_role = Self::get_user_role(&env, &granter);
        if !Self::can_grant_role(&env, granter_role, role.clone()) {
            return Err(OrynError::Unauthorized.into());
        }

        // Set user role
        env.storage().persistent().set(&StorageKey::Roles(user.clone()), &role);

        // Update role members
        let mut members: Vec<Address> = env.storage().persistent()
            .get(&StorageKey::RoleMembers(role.clone()))
            .unwrap_or(Vec::new(&env));
        if !members.contains(&user) {
            members.push_back(user.clone());
            env.storage().persistent().set(&StorageKey::RoleMembers(role), &members);
        }

        // Update user permissions cache
        Self::update_user_permissions_cache(&env, &user);

        // Emit event
        env.events().publish(
            (symbol!("access_control"), symbol!("role_granted")),
            AccessControlEvent {
                user,
                role: Some(role),
                permission: None,
                action: "grant_role".into(),
                timestamp: env.ledger().timestamp(),
            }
        );

        Ok(())
    }

    pub fn revoke_role(env: Env, revoker: Address, user: Address) -> Result<(), Error> {
        revoker.require_auth();
        Self::require_permission(&env, &revoker, Permission::ManageUsers)?;

        let user_role = Self::get_user_role(&env, &user);
        if user_role == Role::SuperAdmin {
            return Err(OrynError::Unauthorized.into()); // Cannot revoke super admin
        }

        // Remove from role members
        let mut members: Vec<Address> = env.storage().persistent()
            .get(&StorageKey::RoleMembers(user_role.clone()))
            .unwrap_or(Vec::new(&env));

        if let Some(index) = members.iter().position(|addr| addr == user) {
            members.remove(index as u32);
            env.storage().persistent().set(&StorageKey::RoleMembers(user_role), &members);
        }

        // Remove role assignment
        env.storage().persistent().remove(&StorageKey::Roles(user.clone()));

        // Clear user permissions cache
        env.storage().persistent().remove(&StorageKey::UserPermissions(user.clone()));

        // Emit event
        env.events().publish(
            (symbol!("access_control"), symbol!("role_revoked")),
            AccessControlEvent {
                user,
                role: Some(user_role),
                permission: None,
                action: "revoke_role".into(),
                timestamp: env.ledger().timestamp(),
            }
        );

        Ok(())
    }

    pub fn assign_default_role(env: Env, user: Address) -> Result<(), Error> {
        // Only callable by contract itself or admin
        if !env.storage().persistent().has(&StorageKey::Roles(user.clone())) {
            env.storage().persistent().set(&StorageKey::Roles(user.clone()), &Role::User);

            // Update role members
            let mut members: Vec<Address> = env.storage().persistent()
                .get(&StorageKey::RoleMembers(Role::User))
                .unwrap_or(Vec::new(&env));
            members.push_back(user.clone());
            env.storage().persistent().set(&StorageKey::RoleMembers(Role::User), &members);

            // Update permissions cache
            Self::update_user_permissions_cache(&env, &user);
        }
        Ok(())
    }

    // ==================== PERMISSION CHECKS ====================

    pub fn has_permission(env: Env, user: Address, permission: Permission) -> bool {
        let user_permissions = Self::get_user_permissions(&env, &user);
        user_permissions.contains(&permission)
    }

    pub fn require_permission(env: &Env, user: &Address, permission: Permission) -> Result<(), Error> {
        if Self::has_permission(env.clone(), user.clone(), permission) {
            Ok(())
        } else {
            Err(OrynError::Unauthorized.into())
        }
    }

    pub fn check_role(env: Env, user: Address, role: Role) -> bool {
        Self::get_user_role(&env, &user) == role
    }

    pub fn require_role(env: &Env, user: &Address, role: Role) -> Result<(), Error> {
        if Self::check_role(env.clone(), user.clone(), role) {
            Ok(())
        } else {
            Err(OrynError::Unauthorized.into())
        }
    }

    // ==================== CONTRACT CONTROL ====================

    pub fn pause_contract(env: Env, caller: Address) -> Result<(), Error> {
        caller.require_auth();
        Self::require_permission(&env, &caller, Permission::PauseContract)?;

        env.storage().persistent().set(&StorageKey::Paused, &true);

        env.events().publish(
            (symbol!("access_control"), symbol!("contract_paused")),
            AccessControlEvent {
                user: caller,
                role: None,
                permission: Some(Permission::PauseContract),
                action: "pause_contract".into(),
                timestamp: env.ledger().timestamp(),
            }
        );

        Ok(())
    }

    pub fn unpause_contract(env: Env, caller: Address) -> Result<(), Error> {
        caller.require_auth();
        Self::require_permission(&env, &caller, Permission::PauseContract)?;

        env.storage().persistent().set(&StorageKey::Paused, &false);

        env.events().publish(
            (symbol!("access_control"), symbol!("contract_unpaused")),
            AccessControlEvent {
                user: caller,
                role: None,
                permission: Some(Permission::PauseContract),
                action: "unpause_contract".into(),
                timestamp: env.ledger().timestamp(),
            }
        );

        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().persistent().get(&StorageKey::Paused).unwrap_or(false)
    }

    // ==================== BLACKLIST MANAGEMENT ====================

    pub fn blacklist_user(env: Env, admin: Address, user: Address) -> Result<(), Error> {
        admin.require_auth();
        Self::require_permission(&env, &admin, Permission::ManageUsers)?;

        // Remove from any existing role
        let current_role = Self::get_user_role(&env, &user);
        if current_role != Role::Blacklisted {
            Self::revoke_role(env.clone(), admin.clone(), user.clone())?;
        }

        // Assign blacklisted role
        Self::grant_role(env, admin, user, Role::Blacklisted)
    }

    pub fn unblacklist_user(env: Env, admin: Address, user: Address) -> Result<(), Error> {
        admin.require_auth();
        Self::require_permission(&env, &admin, Permission::ManageUsers)?;

        // Remove blacklisted role
        env.storage().persistent().remove(&StorageKey::Roles(user.clone()));
        env.storage().persistent().remove(&StorageKey::UserPermissions(user.clone()));

        // Remove from blacklisted members
        let mut blacklisted_members: Vec<Address> = env.storage().persistent()
            .get(&StorageKey::RoleMembers(Role::Blacklisted))
            .unwrap_or(Vec::new(&env));

        if let Some(index) = blacklisted_members.iter().position(|addr| addr == user) {
            blacklisted_members.remove(index as u32);
            env.storage().persistent().set(&StorageKey::RoleMembers(Role::Blacklisted), &blacklisted_members);
        }

        // Assign default user role
        Self::assign_default_role(env, user)
    }

    // ==================== QUERY METHODS ====================

    pub fn get_user_role(env: Env, user: Address) -> Role {
        env.storage().persistent()
            .get(&StorageKey::Roles(user))
            .unwrap_or(Role::User) // Default role
    }

    pub fn get_user_permissions(env: Env, user: Address) -> Vec<Permission> {
        // Try cache first
        if let Some(cached_perms) = env.storage().persistent().get(&StorageKey::UserPermissions(user.clone())) {
            return cached_perms;
        }

        // Compute permissions
        let role = Self::get_user_role(&env, &user);
        let role_perms: Vec<Permission> = env.storage().persistent()
            .get(&StorageKey::Permissions(role))
            .unwrap_or(Vec::new(&env));

        // Cache the result
        env.storage().persistent().set(&StorageKey::UserPermissions(user), &role_perms.clone());

        role_perms
    }

    pub fn get_role_members(env: Env, role: Role) -> Vec<Address> {
        env.storage().persistent()
            .get(&StorageKey::RoleMembers(role))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_role_permissions(env: Env, role: Role) -> Vec<Permission> {
        env.storage().persistent()
            .get(&StorageKey::Permissions(role))
            .unwrap_or(Vec::new(&env))
    }

    // ==================== HELPER METHODS ====================

    fn can_grant_role(env: &Env, granter_role: Role, target_role: Role) -> bool {
        match granter_role {
            Role::SuperAdmin => true, // Can grant any role
            Role::Admin => matches!(target_role, Role::Moderator | Role::Oracle | Role::User | Role::Blacklisted),
            Role::Moderator => matches!(target_role, Role::User | Role::Blacklisted),
            _ => false, // Others cannot grant roles
        }
    }

    fn update_user_permissions_cache(env: &Env, user: &Address) {
        let role = Self::get_user_role(env.clone(), user);
        let permissions: Vec<Permission> = env.storage().persistent()
            .get(&StorageKey::Permissions(role))
            .unwrap_or(Vec::new(env));

        env.storage().persistent().set(&StorageKey::UserPermissions(user.clone()), &permissions);
    }
}