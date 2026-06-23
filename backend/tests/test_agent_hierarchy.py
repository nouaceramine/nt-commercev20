"""
Test Agent Hierarchy System - NT Commerce 12.0
Tests: Agent CRUD, Permissions, Tenant Assignment, Agent Self-Service
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "admin@ntcommerce.com"
SUPER_ADMIN_PASSWORD = "Admin@2024"
TEST_AGENT_EMAIL = "agent_dz@test.com"
TEST_AGENT_PASSWORD = "Agent@123"


class TestSuperAdminLogin:
    """Test Super Admin authentication"""
    
    def test_super_admin_login(self):
        """Super Admin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        # Store token for other tests
        pytest.super_admin_token = data["access_token"]
        print(f"✓ Super Admin login successful")


class TestAgentsAPI:
    """Test Agent CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
            pytest.super_admin_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
    
    def test_get_agents_list(self):
        """GET /saas/agents returns list of agents"""
        response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Found {len(data)} agents")
        # Store agents for later tests
        pytest.agents_list = data
    
    def test_agents_have_required_fields(self):
        """Agents have all required fields including agent_type"""
        response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        assert response.status_code == 200
        agents = response.json()
        
        if len(agents) > 0:
            agent = agents[0]
            required_fields = ["id", "name", "email", "agent_type", "commission_rate", "is_active"]
            for field in required_fields:
                assert field in agent, f"Missing field: {field}"
            # Check agent_type is valid
            assert agent["agent_type"] in ["assistant", "reseller"], f"Invalid agent_type: {agent['agent_type']}"
            print(f"✓ Agent has all required fields including agent_type={agent['agent_type']}")
        else:
            pytest.skip("No agents to test")
    
    def test_create_agent_assistant_type(self):
        """Create new agent with type 'assistant'"""
        unique_id = str(uuid.uuid4())[:8]
        agent_data = {
            "name": f"TEST_Assistant_{unique_id}",
            "email": f"test_assistant_{unique_id}@test.com",
            "password": "Test@123",
            "phone": "0555123456",
            "agent_type": "assistant",
            "commission_rate": 8.0,
            "region": "الجزائر العاصمة",
            "notes": "Test assistant agent"
        }
        
        response = requests.post(f"{BASE_URL}/api/saas/agents", json=agent_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create agent: {response.text}"
        
        created = response.json()
        assert created["agent_type"] == "assistant", f"Expected assistant, got {created['agent_type']}"
        assert created["name"] == agent_data["name"]
        assert created["region"] == agent_data["region"]
        
        # Store for cleanup
        pytest.test_assistant_id = created["id"]
        print(f"✓ Created assistant agent: {created['name']}")
    
    def test_create_agent_reseller_type(self):
        """Create new agent with type 'reseller'"""
        unique_id = str(uuid.uuid4())[:8]
        agent_data = {
            "name": f"TEST_Reseller_{unique_id}",
            "email": f"test_reseller_{unique_id}@test.com",
            "password": "Test@123",
            "phone": "0555654321",
            "agent_type": "reseller",
            "commission_rate": 12.0,
            "region": "وهران",
            "notes": "Test reseller agent"
        }
        
        response = requests.post(f"{BASE_URL}/api/saas/agents", json=agent_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create agent: {response.text}"
        
        created = response.json()
        assert created["agent_type"] == "reseller", f"Expected reseller, got {created['agent_type']}"
        
        # Store for cleanup
        pytest.test_reseller_id = created["id"]
        print(f"✓ Created reseller agent: {created['name']}")


class TestAgentPermissions:
    """Test Agent Permissions API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
            pytest.super_admin_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
    
    def test_get_permissions_template(self):
        """GET /saas/permissions-template returns permission categories"""
        response = requests.get(f"{BASE_URL}/api/saas/permissions-template", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "permissions" in data, "Missing permissions in template"
        assert "categories" in data, "Missing categories in template"
        
        # Check expected categories
        expected_categories = ["tenants", "reports", "subscriptions", "payments", "support", "agents", "system"]
        for cat in expected_categories:
            assert cat in data["categories"], f"Missing category: {cat}"
        
        # Check expected permissions
        expected_perms = ["can_view_tenants", "can_create_tenants", "can_edit_tenants", "can_view_reports"]
        for perm in expected_perms:
            assert perm in data["permissions"], f"Missing permission: {perm}"
        
        print(f"✓ Permissions template has {len(data['permissions'])} permissions in {len(data['categories'])} categories")
    
    def test_get_agent_permissions(self):
        """GET /saas/agents/{id}/permissions returns agent's permissions"""
        # Get first agent
        agents_response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        agents = agents_response.json()
        
        if len(agents) == 0:
            pytest.skip("No agents to test")
        
        agent_id = agents[0]["id"]
        response = requests.get(f"{BASE_URL}/api/saas/agents/{agent_id}/permissions", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "agent_id" in data
        assert "permissions" in data
        assert isinstance(data["permissions"], dict)
        
        print(f"✓ Got permissions for agent {data.get('agent_name', agent_id)}")
    
    def test_update_agent_permissions(self):
        """PUT /saas/agents/{id}/permissions updates permissions"""
        # Get first agent
        agents_response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        agents = agents_response.json()
        
        if len(agents) == 0:
            pytest.skip("No agents to test")
        
        agent_id = agents[0]["id"]
        
        # Update permissions
        new_permissions = {
            "can_view_tenants": True,
            "can_create_tenants": True,
            "can_edit_tenants": False,
            "can_delete_tenants": False,
            "can_view_reports": True,
            "can_export_reports": True,
            "can_view_subscriptions": True,
            "can_edit_subscriptions": False,
            "can_view_payments": True,
            "can_collect_payments": True,
            "can_provide_support": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/saas/agents/{agent_id}/permissions",
            json=new_permissions,
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "message" in data or "permissions" in data
        
        # Verify persistence
        verify_response = requests.get(f"{BASE_URL}/api/saas/agents/{agent_id}/permissions", headers=self.headers)
        verify_data = verify_response.json()
        
        assert verify_data["permissions"]["can_create_tenants"] == True
        assert verify_data["permissions"]["can_edit_tenants"] == False
        
        print(f"✓ Updated and verified permissions for agent {agent_id}")


class TestAgentTenantAssignment:
    """Test Tenant Assignment to Agents"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
            pytest.super_admin_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
    
    def test_get_tenants_list(self):
        """GET /saas/tenants returns list of tenants"""
        response = requests.get(f"{BASE_URL}/api/saas/tenants", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        tenants = response.json()
        assert isinstance(tenants, list)
        pytest.tenants_list = tenants
        print(f"✓ Found {len(tenants)} tenants")
    
    def test_assign_tenants_to_agent(self):
        """PUT /saas/agents/{id}/assign-tenants assigns tenants"""
        # Get agents and tenants
        agents_response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        agents = agents_response.json()
        
        tenants_response = requests.get(f"{BASE_URL}/api/saas/tenants", headers=self.headers)
        tenants = tenants_response.json()
        
        if len(agents) == 0 or len(tenants) == 0:
            pytest.skip("Need at least 1 agent and 1 tenant")
        
        agent_id = agents[0]["id"]
        tenant_ids = [tenants[0]["id"]] if len(tenants) > 0 else []
        
        response = requests.put(
            f"{BASE_URL}/api/saas/agents/{agent_id}/assign-tenants",
            json=tenant_ids,
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "message" in data or "assigned_tenant_ids" in data
        
        print(f"✓ Assigned {len(tenant_ids)} tenant(s) to agent {agent_id}")
    
    def test_get_agent_tenants(self):
        """GET /saas/agents/{id}/tenants returns assigned tenants"""
        agents_response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        agents = agents_response.json()
        
        if len(agents) == 0:
            pytest.skip("No agents to test")
        
        agent_id = agents[0]["id"]
        response = requests.get(f"{BASE_URL}/api/saas/agents/{agent_id}/tenants", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        tenants = response.json()
        assert isinstance(tenants, list)
        print(f"✓ Agent {agent_id} has {len(tenants)} assigned tenant(s)")


class TestAgentSelfService:
    """Test Agent Self-Service Endpoints"""
    
    def test_agent_login(self):
        """POST /saas/agent-login authenticates agent"""
        response = requests.post(f"{BASE_URL}/api/saas/agent-login", json={
            "email": TEST_AGENT_EMAIL,
            "password": TEST_AGENT_PASSWORD
        })
        
        if response.status_code == 401:
            pytest.skip(f"Test agent {TEST_AGENT_EMAIL} not found or wrong password")
        
        assert response.status_code == 200, f"Agent login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        
        pytest.agent_token = data["access_token"]
        pytest.agent_data = data["user"]
        print(f"✓ Agent login successful: {data['user'].get('name', TEST_AGENT_EMAIL)}")
    
    def test_agent_get_profile(self):
        """GET /saas/agent/me returns agent profile"""
        if not hasattr(pytest, 'agent_token'):
            pytest.skip("Agent not logged in")
        
        headers = {"Authorization": f"Bearer {pytest.agent_token}"}
        response = requests.get(f"{BASE_URL}/api/saas/agent/me", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "email" in data
        assert "agent_type" in data
        assert "permissions" in data
        
        print(f"✓ Agent profile: {data['name']} ({data['agent_type']})")
    
    def test_agent_get_my_tenants(self):
        """GET /saas/agent/my-tenants returns agent's tenants"""
        if not hasattr(pytest, 'agent_token'):
            pytest.skip("Agent not logged in")
        
        headers = {"Authorization": f"Bearer {pytest.agent_token}"}
        response = requests.get(f"{BASE_URL}/api/saas/agent/my-tenants", headers=headers)
        
        # May return 403 if agent doesn't have can_view_tenants permission
        if response.status_code == 403:
            print("✓ Agent doesn't have can_view_tenants permission (expected behavior)")
            return
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        tenants = response.json()
        assert isinstance(tenants, list)
        print(f"✓ Agent has {len(tenants)} tenant(s)")
    
    def test_agent_get_my_stats(self):
        """GET /saas/agent/my-stats returns agent statistics"""
        if not hasattr(pytest, 'agent_token'):
            pytest.skip("Agent not logged in")
        
        headers = {"Authorization": f"Bearer {pytest.agent_token}"}
        response = requests.get(f"{BASE_URL}/api/saas/agent/my-stats", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        expected_fields = ["total_tenants", "active_tenants", "total_commissions", "agent_type", "permissions"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Agent stats: {data['total_tenants']} tenants, {data['total_commissions']} commissions")


class TestAgentHierarchy:
    """Test Agent Hierarchy Routes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
            pytest.super_admin_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
    
    def test_get_hierarchy_levels(self):
        """GET /saas/hierarchy/levels returns agent levels"""
        response = requests.get(f"{BASE_URL}/api/saas/hierarchy/levels", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        levels = response.json()
        assert isinstance(levels, list)
        
        if len(levels) > 0:
            level = levels[0]
            assert "name_ar" in level
            assert "level" in level
            assert "commission_rate" in level
        
        print(f"✓ Found {len(levels)} hierarchy levels")
    
    def test_get_hierarchy_tree(self):
        """GET /saas/hierarchy/tree returns agent tree structure"""
        response = requests.get(f"{BASE_URL}/api/saas/hierarchy/tree", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "tree" in data
        assert "levels" in data
        assert "total_agents" in data
        
        print(f"✓ Hierarchy tree: {data['total_agents']} total agents")
    
    def test_get_hierarchy_stats(self):
        """GET /saas/hierarchy/stats returns hierarchy statistics"""
        response = requests.get(f"{BASE_URL}/api/saas/hierarchy/stats", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        expected_fields = ["total_agents", "active_agents", "levels"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Hierarchy stats: {data['total_agents']} agents, {data['active_agents']} active")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
            pytest.super_admin_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
    
    def test_cleanup_test_agents(self):
        """Delete TEST_ prefixed agents"""
        # Get all agents
        response = requests.get(f"{BASE_URL}/api/saas/agents", headers=self.headers)
        agents = response.json()
        
        deleted_count = 0
        for agent in agents:
            if agent["name"].startswith("TEST_"):
                del_response = requests.delete(
                    f"{BASE_URL}/api/saas/agents/{agent['id']}",
                    headers=self.headers
                )
                if del_response.status_code == 200:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test agent(s)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
