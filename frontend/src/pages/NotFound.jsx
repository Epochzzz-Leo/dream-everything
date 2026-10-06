import { Result, Button } from 'antd'
import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <Result
      status="404"
      title="404"
      subTitle="Page not found."
      extra={<Button type="primary" onClick={() => navigate('/')}>Back to home</Button>}
    />
  )
}
