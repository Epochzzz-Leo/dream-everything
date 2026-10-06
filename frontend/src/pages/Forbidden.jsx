import { Result, Button } from 'antd'
import { useNavigate } from 'react-router-dom'

export default function Forbidden() {
  const navigate = useNavigate()
  return (
    <Result
      status="403"
      title="403"
      subTitle="Sorry, you don't have permission to view this page."
      extra={<Button type="primary" onClick={() => navigate('/')}>Back to home</Button>}
    />
  )
}
