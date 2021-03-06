'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import _ from 'underscore';
import moment from 'moment';
import { RestMixin } from '../../rest';
import { Form, FormMixin, Input } from '../../../libs/bootstrap/form';
import { PanelGroup, Panel } from '../../../libs/bootstrap/panel';
import { CompleteSection } from './shared/complete_section';
import { scrollElementIntoView } from '../../../libs/helpers/scroll_into_view';

const vciFormHelper = require('./shared/form');
const CurationInterpretationForm = vciFormHelper.CurationInterpretationForm;
const evaluation_section_mapping = require('./mapping/evaluation_section.json');
const extraEvidence = require('./shared/extra_evidence');

// Display the curator data of the curation data
var CurationInterpretationFunctional = module.exports.CurationInterpretationFunctional = createReactClass({
    mixins: [RestMixin],

    propTypes: {
        data: PropTypes.object,
        interpretation: PropTypes.object,
        updateInterpretationObj: PropTypes.func,
        href_url: PropTypes.object,
        affiliation: PropTypes.object,
        session: PropTypes.object,
        selectedCriteria: PropTypes.string
    },

    getInitialState() {
        return {
            data: this.props.data,
            clinvar_id: null,
            interpretation: this.props.interpretation,
            submitBusy: false,
            pmid: 0,
            selectedCriteria: this.props.selectedCriteria
        };
    },

    componentDidMount() {
        if (this.state.selectedCriteria) {
            setTimeout(scrollElementIntoView(evaluation_section_mapping[this.state.selectedCriteria], 'class'), 200);
        }
    },

    componentWillReceiveProps(nextProps) {
        this.setState({data: nextProps.data, interpretation: nextProps.interpretation});
        if (nextProps.selectedCriteria) {
            this.setState({selectedCriteria: nextProps.selectedCriteria}, () => {
                setTimeout(scrollElementIntoView(evaluation_section_mapping[this.state.selectedCriteria], 'class'), 200);
            });
        }
    },

    render() {
        const affiliation = this.props.affiliation, session = this.props.session;

        return (
            <div className="variant-interpretation functional">
                <PanelGroup accordion><Panel title="Hotspot or functional domain" panelBodyClassName="panel-wide-content"
                    panelClassName="tab-experimental-panel-hotspot-functiona-domain" open>
                    {(this.state.data && this.state.interpretation) ?
                        <div className="row">
                            <div className="col-sm-12">
                                <CurationInterpretationForm renderedFormContent={criteriaGroup1} criteria={['PM1']}
                                    evidenceData={null} evidenceDataUpdated={true}
                                    formDataUpdater={criteriaGroup1Update} variantUuid={this.state.data['@id']}
                                    interpretation={this.state.interpretation} updateInterpretationObj={this.props.updateInterpretationObj}
                                    affiliation={affiliation} session={session} />
                            </div>
                        </div>
                        : null}
                    <extraEvidence.ExtraEvidenceTable category="experimental" subcategory="hotspot-functiona-domain" session={this.props.session}
                        href_url={this.props.href_url} tableName={<span>Curated Literature Evidence (Hotspot or functional domain)</span>}
                        variant={this.state.data} interpretation={this.state.interpretation} updateInterpretationObj={this.props.updateInterpretationObj}
                        viewOnly={this.state.data && !this.state.interpretation} affiliation={affiliation} criteriaList={['PM1']} />
                </Panel></PanelGroup>
                <PanelGroup accordion><Panel title="Experimental Studies" panelBodyClassName="panel-wide-content"
                    panelClassName="tab-experimental-panel-experimental-studies" open>
                    {(this.state.data && this.state.interpretation) ?
                        <div className="row">
                            <div className="col-sm-12">
                                <CurationInterpretationForm renderedFormContent={criteriaGroup2} criteria={['BS3', 'PS3']}
                                    evidenceData={null} evidenceDataUpdated={true} criteriaCrossCheck={[['BS3', 'PS3']]}
                                    formDataUpdater={criteriaGroup2Update} variantUuid={this.state.data['@id']}
                                    interpretation={this.state.interpretation} updateInterpretationObj={this.props.updateInterpretationObj}
                                    affiliation={affiliation} session={session} />
                            </div>
                        </div>
                        : null}
                    <extraEvidence.ExtraEvidenceTable category="experimental" subcategory="experimental-studies" session={this.props.session}
                        href_url={this.props.href_url} tableName={<span>Curated Literature Evidence (Experimental Studies)</span>}
                        variant={this.state.data} interpretation={this.state.interpretation} updateInterpretationObj={this.props.updateInterpretationObj}
                        viewOnly={this.state.data && !this.state.interpretation} affiliation={affiliation} criteriaList={['BS3', 'PS3']} />
                </Panel></PanelGroup>

                {this.state.interpretation ?
                    <CompleteSection interpretation={this.state.interpretation} tabName="experimental" updateInterpretationObj={this.props.updateInterpretationObj} />
                    : null}
            </div>
        );
    }
});


// code for rendering of this group of interpretation forms
var criteriaGroup1 = function() {
    let criteriaList1 = ['PM1']; // array of criteria code handled subgroup of this section
    return (
        <div>
            {vciFormHelper.renderEvalFormSection.call(this, criteriaList1, false)}
        </div>
    );
};
// code for updating the form values of interpretation forms upon receiving
// existing interpretations and evaluations
var criteriaGroup1Update = function(nextProps) {
    vciFormHelper.updateEvalForm.call(this, nextProps, ['PM1'], null);
};


// code for rendering of this group of interpretation forms
var criteriaGroup2 = function() {
    let criteriaList1 = ['BS3', 'PS3']; // array of criteria code handled subgroup of this section
    return (
        <div>
            {vciFormHelper.renderEvalFormSection.call(this, criteriaList1, false)}
        </div>
    );
};
// code for updating the form values of interpretation forms upon receiving
// existing interpretations and evaluations
var criteriaGroup2Update = function(nextProps) {
    vciFormHelper.updateEvalForm.call(this, nextProps, ['BS3', 'PS3'], null);
};

