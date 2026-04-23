import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SideNav,
  SideNavItems,
  SideNavLink,
} from '@carbon/react';
import {
  Dashboard,
  Network_3,
  VirtualPrivateCloud,
  Security,
} from '@carbon/icons-react';

const Navigation = ({ isOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path) => {
    navigate(path);
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <SideNav
      aria-label="Side navigation"
      expanded={isOpen}
      className="side-nav-container"
    >
      <SideNavItems>
        <SideNavLink
          renderIcon={Dashboard}
          onClick={() => handleNavigation('/')}
          isActive={isActive('/')}
        >
          Dashboard
        </SideNavLink>

        <SideNavLink
          renderIcon={Network_3}
          onClick={() => handleNavigation('/backbones')}
          isActive={isActive('/backbones')}
        >
          Backbones
        </SideNavLink>

        <SideNavLink
          renderIcon={VirtualPrivateCloud}
          onClick={() => handleNavigation('/vans')}
          isActive={isActive('/vans')}
        >
          VANs
        </SideNavLink>

        <SideNavLink
          renderIcon={Security}
          onClick={() => handleNavigation('/tls')}
          isActive={isActive('/tls')}
        >
          Certificates
        </SideNavLink>
      </SideNavItems>
    </SideNav>
  );
};

export default Navigation;

// Made with Bob
