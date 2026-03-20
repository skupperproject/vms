import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
} from '@carbon/react';
import {
  Dashboard,
  Network_3,
  Application,
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

  const isMenuActive = (basePath) => {
    return location.pathname.startsWith(basePath);
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

        <SideNavMenu
          renderIcon={Network_3}
          title="Network"
          defaultExpanded={isMenuActive('/network')}
        >
          <SideNavMenuItem
            onClick={() => handleNavigation('/network/backbones')}
            isActive={isActive('/network/backbones')}
          >
            Backbones
          </SideNavMenuItem>
          <SideNavMenuItem
            onClick={() => handleNavigation('/network/vans')}
            isActive={isActive('/network/vans')}
          >
            VANs
          </SideNavMenuItem>
          <SideNavMenuItem
            onClick={() => handleNavigation('/network/tls')}
            isActive={isActive('/network/tls')}
          >
            TLS
          </SideNavMenuItem>
        </SideNavMenu>

        <SideNavMenu
          renderIcon={Application}
          title="Compose"
          defaultExpanded={isMenuActive('/compose')}
        >
          <SideNavMenuItem
            onClick={() => handleNavigation('/compose/library')}
            isActive={isActive('/compose/library')}
          >
            Library
          </SideNavMenuItem>
          <SideNavMenuItem
            onClick={() => handleNavigation('/compose/applications')}
            isActive={isActive('/compose/applications')}
          >
            Applications
          </SideNavMenuItem>
        </SideNavMenu>
      </SideNavItems>
    </SideNav>
  );
};

export default Navigation;

// Made with Bob
