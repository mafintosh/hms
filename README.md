# hms

Work in progress. Ship all kinds of services

```
npm install -g hms
```

Afterwards you should have an command line tool called `hms`.

## Commands

All commands accept the following options

* `--remote,-r` to specify a remote terminal/dock (defaults to localhost)

#### `hms verify`

Verify a remote ssh host. Required once for all ssh hosts

* `--expect,-e` to set an expected server fingerprint. If not specified the verification will be interactive
* `--key,-k` to specify an explicit ssh key. Per default `~/.ssh/id_rsa` and the ssh agent is used.

#### `hms defaults`

Change the default value of the various command line arguments. To change your remote do

	hms defaults --remote username@your-server.com

To set it back do the original default value do

	hms defaults --no-remote

To set defaults for a specific command instead of globally do

	hms defaults add --start 'node .'

All default (and general config settings) are stored in `~/.hms.json`

#### `hms list [service-name?]`

List services and the configuration.

#### `hms add [service-name]`

Add a new service.

* `--start,-s` to specify a `start` script. Ie. `node .` to start a node service
* `--build,-b` to specify a `build` script. Ie. `npm install .` to install node modules
* `--docks,-d` to specify the docks to deploy to. If set to a number it will be converter to a set of docks.
* `--env,-e` to set env varibles. Format is `ENV_VAR=value;ENV_VAR2=value2

#### `hms update [service-name]`

Update an existing service. Accepts the same options as `hms add`.
Note that update will not restart the service. To do this just issue a `hms restart`

#### `hms deploy [service-name]`

Upload cwd as a tarball to service-name and deploy and restart it.

* `--revision` to set a deploy revision tag. Defaults to `git describe` if you are in a git repo.

#### `hms remove [service-name]`

Stop and remove a service.

#### `hms start|stop|restart [service-name]`

Send a start/stop/restart signal the service. All restarts can be done gracefully by listening for `SIGTERM` and exiting nicely.

#### `hms ps [service-name?]`

List processes running on all docks. Omit the service name to list all processes.

* `--env` to also list the environment that the processes use.

#### `hms log [service-name?]`

Tail the log of a service. Omit the service name to tail all services.

## Remote services

Run the following commands on your remote server that you want to deploy to

#### `hms terminal`

Starts a "build-and-distribute" hub that you can deploy to. After you deploy to a terminal it will run the build script and distribute the build to the docks.

* `--dock,-d` to also start a dock (this allows the terminal to run services as well)

#### `hms dock`

Starts a dock that can run and manage services.

* `--remote,-r` to set the remote terminal to connect to. defaults to localhost

## Getting started

First ssh to a remote server and install hms.
Then start up a terminal and a dock.

	hms terminal --dock # starts both a terminal and a dock

Optionally you can start the dock (or multiple docks as seperate processes)

	hms dock --remote [terminal-hostname]

Then on your local machine verify the connection

	hms verify --remote username@your-server.com

hms uses ssh to contact the server so `username@your-server.com` should be similar to arguments you passed to ssh.
Then add a simple node app

	hms add my-app --remote username@your-server.com --start 'node .' --build 'npm install' --docks 1
	hms list my-app --remote username@your-server.com

The `--start` argument is your start script, `--build` is your build script and `--docks` tells hms to deploy it to 1 dock.
If you do not want to specify the remote everytime you do a command you can set a default value

	hms defaults --remote username@your-server.com

Or setup a bash alias

	alias hms-your-server='hms --remote username@your-server.com'

You are now ready to deploy your service. Goto your local app folder and do

	hms deploy my-app --remote username@your-server.com
	hms ps my-app

The ps output should verify that the app is running.

## License

MIT
