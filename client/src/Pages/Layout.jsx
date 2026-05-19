import Navbar from '../Components/Navbar'
import { Outlet } from 'react-router-dom'

const Layout = () => {
  return (
    <div>
      <Navbar />
      <Outlet />  {/* renders Dashboard, WriteArticle, etc. here */}
    </div>
  )
}

export default Layout