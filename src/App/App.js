// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: MIT

import React, { Component } from 'react';
import {
  BrowserRouter as Router,
  Redirect,
  Route,
  Link
} from 'react-router-dom';
import { inject, observer } from 'mobx-react';

import Loading from '../Loading';
import Send from '../Send';
import Receive from '../Receive';
import Tokens from '../Tokens';
import './App.css';

@inject('parityStore')
@observer
class App extends Component {
  render() {
    const {
      parityStore: { isReady }
    } = this.props;

    return (
      <Router>
        <div className="wrapper">
          <div className="content">
            <div className="connector">
              <svg width="60px" height="30px" viewBox="0 0 60 30">
                <polygon points="0 30 60 30 30 0" />
              </svg>
            </div>
            <div className="window">
              <Route exact path="/" component={Tokens} />
              <Route path="/loading" component={Loading} />
              <Route path="/send" component={Send} />
              <Route path="/receive" component={Receive} />

              <nav className="primary-nav">
                <Link to="/receive" className="icon -receive">
                  Receive
                </Link>
                <Link to="/" className="icon -settings">
                  Settings
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </Router>
    );
  }
}

export default App;
