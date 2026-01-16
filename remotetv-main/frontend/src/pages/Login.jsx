import { useState } from "react";
import { useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    console.log(email, password);
    
    if (email === "sachin@ifocussystec.com" && password === "Ifocus@123") {
      // Store username in localStorage
      localStorage.setItem('username', email);
      // Navigate to live page
      navigate('/live');
    } else {
      alert('Invalid credentials. Please try again.');
    }
  };

  const fillDemoCredentials = () => {
    setEmail("sachin@ifocussystec.com");
    setPassword("Ifocus@123");
  };

  return (
    <>
      <div className="flex min-h-full h-screen">
        {/* Left side - Background Image */}
        <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:items-center relative overflow-hidden">
          <img
            alt=""
            src="https://images.unsplash.com/photo-1496917756835-20cb06e75b4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1908&q=80"
            className="absolute inset-0 size-full object-cover"
          />
        </div>

        {/* Right side - Login Form */}
        <div className="flex flex-1 flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-md">
            <div className="text-center mb-8">
              <img
                alt="iFocus Systec"
                src={logo}
                className="h-10 w-auto mx-auto mb-6"
              />
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Remote Lab Access
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Sign in to test TV devices remotely
              </p>
            </div>

            <div className="bg-white shadow-xl rounded-lg border border-gray-200 p-8">
              <form action="#" method="POST" className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm/6 font-medium text-gray-900"
                  >
                    Email address
                  </label>
                  <div className="mt-2">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-20 transition-all duration-200"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm/6 font-medium text-gray-900"
                  >
                    Password
                  </label>
                  <div className="mt-2">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-20 transition-all duration-200"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-6 shrink-0 items-center">
                      <div className="group grid size-4 grid-cols-1">
                        <input
                          id="remember-me"
                          name="remember-me"
                          type="checkbox"
                          className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                        />
                        <svg
                          fill="none"
                          viewBox="0 0 14 14"
                          className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25"
                        >
                          <path
                            d="M3 8L6 11L11 3.5"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="opacity-0 group-has-checked:opacity-100"
                          />
                          <path
                            d="M3 7H11"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="opacity-0 group-has-indeterminate:opacity-100"
                          />
                        </svg>
                      </div>
                    </div>
                    <label
                      htmlFor="remember-me"
                      className="block text-sm/6 text-gray-900"
                    >
                      Remember me
                    </label>
                  </div>

                  <div className="text-sm/6">
                    <button
                      type="button"
                      onClick={fillDemoCredentials}
                      className="font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      Use Demo Credentials
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02]"
                  >
                    Sign in
                  </button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm font-medium leading-6">
                      <span className="bg-white px-6 text-gray-500">Or continue with</span>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => navigate('/stream')}
                    className="flex w-full justify-center rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
                  >
                    Start Device Testing
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}