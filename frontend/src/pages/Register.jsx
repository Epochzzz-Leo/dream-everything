import { useState } from 'react'
import { Form, Input, Button, message } from 'antd'
import { IdcardOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../api/auth'
import AuthShell from '../components/AuthShell'
import useAuthWide from '../hooks/useAuthWide'

/**
 * 注册页（公开）。字段与后端一致：loginName（固定登录名）/ userNickname（显示昵称）/ password。
 * 后端对登录名和昵称各自查重，重复会被拒。注册不需要验证码。
 */
export default function Register() {
  const navigate = useNavigate()
  const wide = useAuthWide()
  const [submitting, setSubmitting] = useState(false)

  const onFinish = async (values) => {
    setSubmitting(true)
    try {
      // 只把后端需要的字段传过去（confirm 仅前端用）
      await authApi.register({
        loginName: values.loginName,
        userNickname: values.userNickname,
        password: values.password,
      })
      message.success('Registered. Please sign in')
      navigate('/login')
    } catch (e) {
      // 错误已由 http 拦截器弹出
    } finally {
      setSubmitting(false)
    }
  }

  const iconStyle = { color: '#b3b3b3' }

  return (
    <AuthShell title="Create an account" subtitle="Join Chat Everything to post and chat">
      <Form onFinish={onFinish} size={wide ? 'large' : 'middle'}>
        <Form.Item name="loginName" rules={[{ required: true, message: 'Please enter your login name' }]}>
          <Input variant="filled" prefix={<UserOutlined style={iconStyle} />} placeholder="Login name (used to sign in, cannot be changed later)" autoComplete="off" />
        </Form.Item>
        <Form.Item name="userNickname" rules={[{ required: true, message: 'Please enter a nickname' }]}>
          <Input variant="filled" prefix={<IdcardOutlined style={iconStyle} />} placeholder="Nickname (shown publicly, can be changed later)" autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: 'Please enter your password' }]}>
          <Input.Password variant="filled" prefix={<LockOutlined style={iconStyle} />} placeholder="Password" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="confirm"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Please confirm your password' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('Passwords do not match')),
            }),
          ]}
        >
          <Input.Password variant="filled" prefix={<LockOutlined style={iconStyle} />} placeholder="Confirm password" autoComplete="off" />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          size={wide ? 'large' : 'middle'}
          loading={submitting}
          style={{ fontWeight: 700, boxShadow: '0 6px 16px rgba(22,119,255,.3)' }}
        >
          Sign up
        </Button>
        <div style={{ marginTop: wide ? 20 : 14, textAlign: 'center', color: '#8c8c8c', fontSize: wide ? 14 : 13 }}>
          {'Already have an account? '}<Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </div>
      </Form>
    </AuthShell>
  )
}
